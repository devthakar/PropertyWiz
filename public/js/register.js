document.getElementById('registration-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const username = document.getElementById('new-username').value;
    const password = document.getElementById('new-password').value;
    const role = document.getElementById('new-role').value;

    if (!name || !email || !username || !password || !role) {
        alert('Please fill in all fields.');
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const usernameRegex = /^[a-zA-Z0-9_]+$/;

    if (!emailRegex.test(email)) {
        alert('Please enter a valid email address.');
        return;
    }

    if (!usernameRegex.test(username)) {
        alert('Username can only contain letters, numbers, and underscores.');
        return;
    }

    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, username, password, role })
        });

        const result = await response.text();
        alert(result);

        if (response.ok) {
            window.location.href = '/sign_in';
        }
    } catch (error) {
        console.error('Error during registration:', error);
        alert('An error occurred during registration. Please try again.');
    }
});
