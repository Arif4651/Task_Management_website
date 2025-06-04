document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  const role = document.getElementById('role').value;

  try {
    console.log('Attempting login with:', { email, role });
    
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ email, password, role }),
    });

    const data = await res.json();
    console.log('Login response:', data);

    if (res.ok) {
      if (!data.session) {
        console.error('Login response missing session data:', data);
        document.getElementById('loginMessage').textContent = 'Invalid login response from server';
        return;
      }

      // Store session in localStorage
      const sessionStr = JSON.stringify(data.session);
      console.log('Storing session in localStorage:', sessionStr);
      localStorage.setItem('session', sessionStr);
      
      // Verify session was stored
      const storedSession = localStorage.getItem('session');
      console.log('Verified stored session:', storedSession);
      
      document.getElementById('loginMessage').textContent = data.message;
      
      // Redirect based on role
      if (role === 'admin') {
        console.log('Redirecting to admin dashboard');
        window.location.href = '/admin-dashboard';
      } else {
        console.log('Redirecting to user dashboard');
        window.location.href = '/user-dashboard';
      }
    } else {
      console.error('Login failed:', data.error);
      document.getElementById('loginMessage').textContent = data.error || 'Login failed';
    }
  } catch (error) {
    console.error('Login error:', error);
    document.getElementById('loginMessage').textContent = 'An error occurred during login';
  }
});
