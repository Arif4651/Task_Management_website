import express from 'express';
import supabase from '../supabase.js';

const router = express.Router();

// Signup route
router.post('/signup', async (req, res) => {
  const { email, password, full_name, role } = req.body;
  
  // Input validation
  if (!email || !password || !full_name || !role) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }
  
  // Basic password validation
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }
  
  try {
    // Create user in Supabase Auth (using regular signup)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name,
          role
        }
      }
    });

    if (error) return res.status(400).json({ error: error.message });

    // Insert user in users table
    const { error: dbError } = await supabase
      .from('users')
      .insert([{ 
        id: data.user.id, 
        email, 
        full_name, 
        role,
        created_at: new Date().toISOString()
      }]);

    if (dbError) return res.status(400).json({ error: dbError.message });

    return res.status(201).json({ 
      message: 'User registered successfully! Please check your email for verification.',
      userId: data.user.id
    });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Server error during signup.' });
  }
});

// Login route
router.post('/login', async (req, res) => {
  const { email, password, role } = req.body;
  
  console.log('Login attempt:', { email, role });
  
  // Input validation
  if (!email || !password || !role) {
    console.log('Missing required fields:', { email: !!email, password: !!password, role: !!role });
    return res.status(400).json({ error: 'Email, password and role are required.' });
  }

  try {
    // If role is admin, check admin table first
    if (role === 'admin') {
      const { data, error } = await supabase
        .from('admins')
        .select('*')
        .eq('email', email)
        .single();

      if (error) {
        console.error('Admin login error:', error);
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      if (!data) {
        console.log('No admin found with email:', email);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // For admin, we're using password_hash comparison
      if (data.password_hash !== password) {
        console.log('Password mismatch for admin:', email);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Create a simple session for admin
      const adminSession = {
        access_token: 'admin_' + Date.now(), // Simple token for admin
        user: {
          id: data.id,
          email: data.email,
          role: 'admin'
        }
      };

      // Return success with admin info and session
      return res.json({ 
        message: 'Admin login successful', 
        session: adminSession,
        user: { 
          id: data.id,
          email: data.email, 
          role: 'admin',
          full_name: data.full_name || 'Admin'
        },
        redirectUrl: '/admin-dashboard'
      });
    }

    // For regular user, use supabase auth
    console.log('Attempting regular user login with Supabase');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      console.error('Supabase auth error:', error);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('Supabase auth successful, fetching user data');

    // Fetch user info from users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (userError) {
      console.error('Error fetching user data:', userError);
      return res.status(401).json({ error: 'User not found' });
    }

    if (userData.role !== role) {
      console.error('Role mismatch:', { userRole: userData.role, requestedRole: role });
      return res.status(401).json({ error: 'Role mismatch' });
    }

    console.log('User data fetched successfully:', userData);

    // Create session object
    const sessionData = {
      user: {
        id: userData.id,
        email: userData.email,
        full_name: userData.full_name,
        role: userData.role
      },
      access_token: data.session.access_token
    };

    console.log('Sending session data:', sessionData);

    // Return success + session data with redirect URL
    return res.json({ 
      message: 'User login successful', 
      session: sessionData,
      user: userData,
      redirectUrl: '/user-dashboard.html'
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error during login.' });
  }
});

// Create admin route (for initial setup)
router.post('/create-admin', async (req, res) => {
  const { email, password, full_name } = req.body;
  
  // Input validation
  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'Email, password and full name are required.' });
  }
  
  try {
    // Check if admin already exists
    const { data: existingAdmin } = await supabase
      .from('admins')
      .select('*')
      .eq('email', email)
      .single();

    if (existingAdmin) {
      return res.status(400).json({ error: 'Admin with this email already exists.' });
    }

    // Create admin record
    const { data, error } = await supabase
      .from('admins')
      .insert([{ 
        email,
        password_hash: password, // In production, this should be hashed
        full_name,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('Admin creation error:', error);
      return res.status(400).json({ error: error.message });
    }

    return res.status(201).json({ 
      message: 'Admin account created successfully',
      admin: {
        id: data.id,
        email: data.email,
        full_name: data.full_name
      }
    });
  } catch (err) {
    console.error('Admin creation error:', err);
    return res.status(500).json({ error: 'Server error during admin creation.' });
  }
});

// Get admin details by email
router.get('/admin/:email', async (req, res) => {
    const { email } = req.params;

    try {
        const { data, error } = await supabase
            .from('admins')
            .select('id, email, full_name')
            .eq('email', email)
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ error: 'Admin not found' });
        }

        res.json(data);
    } catch (err) {
        console.error('Error fetching admin details:', err);
        res.status(500).json({ error: 'Server error fetching admin details.' });
    }
});

export default router;
