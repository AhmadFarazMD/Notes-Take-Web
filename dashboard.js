// Global variables
let currentNoteId = null;
const notesContainer = document.getElementById('notes');
const noteModal = document.getElementById('noteModal');
const noteForm = document.getElementById('noteForm');
const modalTitle = document.getElementById('modalTitle');
const fileInput = document.getElementById('attachments');
const fileList = document.getElementById('fileList');
const filePreviewModal = document.getElementById('filePreviewModal');
const filePreviewContent = document.getElementById('filePreviewContent');

// Event Listeners
document.getElementById('createNote').addEventListener('click', () => openNoteModal());
noteForm.addEventListener('submit', handleSaveNote);
fileInput.addEventListener('change', handleFileSelection);

// Handle file selection
function handleFileSelection(e) {
    const files = Array.from(e.target.files);
    fileList.innerHTML = '';
    
    files.forEach(file => {
        const fileSize = (file.size / 1024 / 1024).toFixed(2); // Convert to MB
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <i class="fas fa-file"></i>
            <span>${escapeHtml(file.name)} (${fileSize} MB)</span>
            <button type="button" class="btn-remove" onclick="removeFile(this)">
                <i class="fas fa-times"></i>
            </button>
        `;
        fileList.appendChild(fileItem);
    });
}

// Remove file from selection
function removeFile(button) {
    const fileItem = button.parentElement;
    fileItem.remove();
    // Clear the file input if all files are removed
    if (fileList.children.length === 0) {
        fileInput.value = '';
    }
}

// Fetch all notes with attachments
async function fetchNotes() {
    try {
        const { data: notes, error } = await supabase
            .from('notes')
            .select(`
                *,
                note_attachments (
                    id,
                    file_name,
                    file_type,
                    file_size,
                    file_path
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        displayNotes(notes);
    } catch (error) {
        console.error('Error fetching notes:', error.message);
        showError('Failed to load notes. Please try again.');
    }
}

// Display notes in the grid
function displayNotes(notes) {
    notesContainer.innerHTML = '';
    if (!notes || notes.length === 0) {
        notesContainer.innerHTML = '<p class="no-notes">No notes yet. Create your first note!</p>';
        return;
    }
    
    notes.forEach(note => {
        const attachmentsHtml = note.note_attachments?.length 
            ? `<div class="note-attachments">
                ${note.note_attachments.map(attachment => `
                    <div class="attachment-item" onclick="viewAttachment('${attachment.file_path}', '${attachment.file_type}')">
                        <i class="fas fa-paperclip"></i>
                        <span>${escapeHtml(attachment.file_name)}</span>
                    </div>
                `).join('')}
               </div>`
            : '';

        const noteCard = document.createElement('div');
        noteCard.className = 'note-card';
        noteCard.innerHTML = `
            <h3>${escapeHtml(note.title)}</h3>
            <p>${escapeHtml(note.content)}</p>
            ${attachmentsHtml}
            <div class="note-actions">
                <button onclick="editNote(${note.id})" class="btn btn-edit">Edit</button>
                <button onclick="deleteNote(${note.id})" class="btn btn-delete">Delete</button>
            </div>
        `;
        notesContainer.appendChild(noteCard);
    });
}

// View attachment
async function viewAttachment(filePath, fileType) {
    try {
        const { data: signedURL, error: signedURLError } = await supabase.storage
            .from('note-attachments')
            .createSignedUrl(filePath, 300); // URL valid for 5 minutes

        if (signedURLError) throw signedURLError;

        filePreviewContent.innerHTML = '';
        filePreviewModal.style.display = 'block';

        if (fileType.startsWith('image/')) {
            filePreviewContent.innerHTML = `<img src="${signedURL.signedUrl}" alt="Preview" style="max-width: 100%; height: auto;">`;
        } else if (fileType === 'application/pdf') {
            filePreviewContent.innerHTML = `<iframe src="${signedURL.signedUrl}" width="100%" height="500px"></iframe>`;
        } else {
            filePreviewContent.innerHTML = `
                <div style="text-align: center; padding: 20px;">
                    <p>Download your file:</p>
                    <a href="${signedURL.signedUrl}" download class="btn btn-primary">Download File</a>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error viewing attachment:', error);
        showError('Failed to load attachment. Please try again.');
    }
}

// Close file preview modal
function closeFilePreviewModal() {
    filePreviewModal.style.display = 'none';
    filePreviewContent.innerHTML = '';
}

// Handle save note with attachments
async function handleSaveNote(e) {
    e.preventDefault();
    
    const title = document.getElementById('noteTitle').value.trim();
    const content = document.getElementById('noteContent').value.trim();
    const files = fileInput.files;
    
    if (!title) {
        showError('Title is required');
        return;
    }
    
    try {
        // Get the current user
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        
        if (!user) {
            window.location.href = 'signin.html';
            return;
        }

        let noteId = currentNoteId;

        if (currentNoteId) {
            // Update existing note
            const { error } = await supabase
                .from('notes')
                .update({ 
                    title, 
                    content,
                    updated_at: new Date().toISOString()
                })
                .eq('id', currentNoteId)
                .eq('user_id', user.id);
            
            if (error) throw error;
        } else {
            // Create new note
            const { data, error } = await supabase
                .from('notes')
                .insert([{ 
                    title, 
                    content,
                    user_id: user.id
                }])
                .select();
            
            if (error) throw error;
            noteId = data[0].id;
        }

        // Handle file uploads
        if (files.length > 0) {
            for (const file of files) {
                const timestamp = new Date().getTime();
                const fileExt = file.name.split('.').pop();
                const fileName = `${timestamp}_${Math.random().toString(36).substring(2)}.${fileExt}`;
                const filePath = `${fileName}`; // Simplified path

                // Upload file to Supabase Storage
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('note-attachments')
                    .upload(filePath, file, {
                        cacheControl: '3600',
                        upsert: false
                    });

                if (uploadError) {
                    console.error('Upload error:', uploadError);
                    throw uploadError;
                }

                // Get the public URL for the uploaded file
                const { data: { publicUrl } } = supabase.storage
                    .from('note-attachments')
                    .getPublicUrl(filePath);

                // Create attachment record
                const { error: attachmentError } = await supabase
                    .from('note_attachments')
                    .insert([{
                        note_id: noteId,
                        file_name: file.name,
                        file_type: file.type,
                        file_size: file.size,
                        file_path: filePath,
                        user_id: user.id
                    }]);

                if (attachmentError) {
                    console.error('Attachment error:', attachmentError);
                    throw attachmentError;
                }
            }
        }
        
        closeNoteModal();
        fetchNotes();
        showSuccess('Note saved successfully!');
    } catch (error) {
        console.error('Error saving note:', error);
        showError(error.message || 'Failed to save note. Please try again.');
    }
}

// Show success message
function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    document.body.appendChild(successDiv);
    
    setTimeout(() => {
        successDiv.remove();
    }, 3000);
}

// Open note modal
function openNoteModal(note = null) {
    modalTitle.textContent = note ? 'Edit Note' : 'Create Note';
    currentNoteId = note ? note.id : null;
    
    document.getElementById('noteTitle').value = note ? note.title : '';
    document.getElementById('noteContent').value = note ? note.content : '';
    
    noteModal.style.display = 'block';
}

// Close note modal
function closeNoteModal() {
    noteModal.style.display = 'none';
    noteForm.reset();
    currentNoteId = null;
}

// Edit note
async function editNote(id) {
    try {
        const { data: note, error } = await supabase
            .from('notes')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) throw error;
        
        openNoteModal(note);
    } catch (error) {
        console.error('Error fetching note:', error.message);
        showError('Failed to load note. Please try again.');
    }
}

// Delete note
async function deleteNote(id) {
    if (!confirm('Are you sure you want to delete this note?')) return;
    
    try {
        const { error } = await supabase
            .from('notes')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        fetchNotes();
    } catch (error) {
        console.error('Error deleting note:', error.message);
        showError('Failed to delete note. Please try again.');
    }
}

// Show error message
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 3000);
}

// Escape HTML to prevent XSS
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Add styles for file upload and attachments
const styles = document.createElement('style');
styles.textContent = `
    .modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
    }
    
    .modal-content {
        background-color: white;
        padding: 2rem;
        border-radius: 10px;
        width: 90%;
        max-width: 500px;
    }
    
    textarea {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 5px;
        resize: vertical;
    }

    .file-upload-container {
        border: 2px dashed #ddd;
        padding: 1rem;
        text-align: center;
        border-radius: 5px;
        margin-bottom: 1rem;
    }

    .file-upload-container input[type="file"] {
        display: none;
    }

    .file-upload-button {
        cursor: pointer;
        color: #4a90e2;
    }

    .file-upload-button i {
        font-size: 2rem;
        margin-bottom: 0.5rem;
    }

    .file-list {
        margin-top: 1rem;
    }

    .file-item {
        display: flex;
        align-items: center;
        padding: 0.5rem;
        background: #f5f5f5;
        border-radius: 5px;
        margin-bottom: 0.5rem;
    }

    .file-item i {
        margin-right: 0.5rem;
    }

    .btn-remove {
        margin-left: auto;
        background: none;
        border: none;
        color: #ff4444;
        cursor: pointer;
    }

    .note-attachments {
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid #eee;
    }

    .attachment-item {
        display: flex;
        align-items: center;
        padding: 0.5rem;
        background: #f5f5f5;
        border-radius: 5px;
        margin-bottom: 0.5rem;
        cursor: pointer;
    }

    .attachment-item:hover {
        background: #e5e5e5;
    }

    .attachment-item i {
        margin-right: 0.5rem;
        color: #4a90e2;
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
    }

    .close-button {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
    }

    .error-message {
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: #ff4444;
        color: white;
        padding: 1rem;
        border-radius: 5px;
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
    }

    .success-message {
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: #4CAF50;
        color: white;
        padding: 1rem;
        border-radius: 5px;
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
    }

    .no-notes {
        text-align: center;
        color: #666;
        margin-top: 2rem;
    }

    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(styles);

const additionalStyles = document.createElement('style');
additionalStyles.textContent = `
    .preview-container {
        max-width: 100%;
        max-height: 80vh;
        overflow: auto;
        text-align: center;
    }

    .preview-image {
        max-width: 100%;
        height: auto;
        margin: 0 auto;
    }

    .modal-content {
        max-width: 90%;
        max-height: 90vh;
        overflow: auto;
        position: relative;
    }

    .close-button {
        position: absolute;
        right: 1rem;
        top: 1rem;
        background: rgba(0, 0, 0, 0.5);
        color: white;
        border: none;
        border-radius: 50%;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.3s;
    }

    .close-button:hover {
        background: rgba(0, 0, 0, 0.7);
    }
`;
document.head.appendChild(additionalStyles);

// Initialize file upload styling
document.querySelector('.file-upload-button').addEventListener('click', () => {
    document.getElementById('attachments').click();
});

// Fetch notes on page load
fetchNotes();
