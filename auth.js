// Initialize Supabase client
const SUPABASE_URL = 'https://iwyfyyiaznsqvpvihqgm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3eWZ5eWlhem5zcXZwdmlocWdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgyNTIxOTcsImV4cCI6MjA1MzgyODE5N30.s910uatDLMeWE28_ojTrwSMUsl7zvnvZC_VYX-TbElE';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let isCheckingAuth = false;

// Check authentication status
async function checkAuth() {
    if (isCheckingAuth) return;
    isCheckingAuth = true;

    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        
        const currentPath = window.location.pathname;
        const isAuthPage = currentPath.includes('signin.html') || 
                          currentPath.includes('signup.html') || 
                          currentPath.includes('reset-password.html');
        
        if (!user && !currentPath.includes('index.html') && !isAuthPage) {
            window.location.href = 'signin.html';
        } else if (user && isAuthPage) {
            window.location.href = 'dashboard.html';
        }
    } catch (error) {
        console.error('Auth check error:', error.message);
    } finally {
        isCheckingAuth = false;
    }
}

// Handle sign up
async function handleSignup(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const errorDiv = document.getElementById('error');
    const successDiv = document.getElementById('success');

    if (password !== confirmPassword) {
        errorDiv.textContent = 'Passwords do not match';
        return;
    }

    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) throw error;

        errorDiv.textContent = '';
        successDiv.textContent = 'Please check your email for verification link';
        document.getElementById('signupForm').reset();
    } catch (error) {
        errorDiv.textContent = error.message;
        successDiv.textContent = '';
    }
}

// Handle sign in
async function handleSignin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('error');

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) throw error;

        window.location.href = 'dashboard.html';
    } catch (error) {
        errorDiv.textContent = error.message;
    }
}

// Handle password reset
async function handlePasswordReset(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const errorDiv = document.getElementById('error');
    const successDiv = document.getElementById('success');

    try {
        const { data, error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;

        errorDiv.textContent = '';
        successDiv.textContent = 'Password reset link sent to your email';
        document.getElementById('resetPasswordForm').reset();
    } catch (error) {
        errorDiv.textContent = error.message;
        successDiv.textContent = '';
    }
}

// Handle sign out
async function handleSignout() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        window.location.href = 'signin.html';
    } catch (error) {
        console.error('Error signing out:', error.message);
    }
}

// Add event listener for sign out button if it exists
const signoutButton = document.getElementById('signout');
if (signoutButton) {
    signoutButton.addEventListener('click', handleSignout);
}

// Check authentication status on page load
document.addEventListener('DOMContentLoaded', checkAuth);
