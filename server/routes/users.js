import express from 'express';
import  supabase  from '../supabase.js';

const router = express.Router();

// Get all users
router.get('/', async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, email, full_name')
            .order('full_name');

        if (error) {
            console.error('Error fetching users:', error);
            return res.status(500).json({ error: 'Failed to fetch users' });
        }

        res.json(users);
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user by email
router.get('/email/:email', async (req, res) => {
    const { email } = req.params;

    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (error) {
            console.error('Error fetching user:', error);
            return res.status(404).json({ error: 'User not found' });
        }

        if (!data) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(data);
    } catch (err) {
        console.error('Server error fetching user:', err);
        res.status(500).json({ error: 'Server error fetching user.' });
    }
});

export default router;
