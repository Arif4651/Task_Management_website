import express from 'express';
import supabase from '../supabase.js';

const router = express.Router();

// Get tasks assigned to user or all tasks if admin
router.get('/', async (req, res) => {
  const { user_id, role, user_email } = req.query;

  try {
    // If user_email is provided, first get the user's ID
    let userId = user_id;
    if (user_email && !user_id) {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('email', user_email)
        .single();

      if (userError) {
        console.error('Error finding user:', userError);
        return res.status(404).json({ error: 'User not found' });
      }

      if (!userData) {
        return res.status(404).json({ error: 'User not found' });
      }

      userId = userData.id;
    }

    // Now fetch tasks using the user ID
    let query = supabase.from('tasks')
      .select(`
        *,
        assigned_by:admins!assigned_by(id, email, full_name),
        assigned_to:users!assigned_to(id, email, full_name)
      `);

    if (role === 'regular_user' || userId) {
      query = query.eq('assigned_to', userId);
    }

    const { data: tasks, error: tasksError } = await query;
    
    if (tasksError) {
      console.error('Error fetching tasks:', tasksError);
      return res.status(400).json({ error: tasksError.message });
    }

    if (!tasks) {
      return res.json([]);
    }

    res.json(tasks);
  } catch (err) {
    console.error('Server error fetching tasks:', err);
    res.status(500).json({ error: 'Server error fetching tasks.' });
  }
});

// Create new task (admin only)
router.post('/', async (req, res) => {
  const { title, description, due_date, priority, admin_email } = req.body;

  if (!title || !description || !due_date || !priority || !admin_email) {
    return res.status(400).json({ 
      error: 'Missing required fields',
      details: {
        title: !title ? 'Title is required' : null,
        description: !description ? 'Description is required' : null,
        due_date: !due_date ? 'Due date is required' : null,
        priority: !priority ? 'Priority is required' : null,
        admin_email: !admin_email ? 'Admin email is required' : null
      }
    });
  }

  try {
    // Get admin ID using email
    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('id')
      .eq('email', admin_email)
      .single();

    if (adminError || !adminData) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    // Create task with initial data (without assignment)
    const { data, error } = await supabase
      .from('tasks')
      .insert([
        {
          title,
          description,
          due_date,
          priority,
          assigned_by: adminData.id,
          status: 'In Progress'  // Default status
        }
      ])
      .select(`
        *,
        assigned_by:admins!assigned_by(id, email, full_name)
      `);

    if (error) return res.status(400).json({ error: error.message });

    res.status(201).json({ 
      message: 'Task created successfully', 
      task: data[0]
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error creating task.' });
  }
});

// Assign task to user
router.patch('/:id/assign', async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    // Verify user exists
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', user_id)
      .single();

    if (userError || !userData) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update task assignment
    const { data, error } = await supabase
      .from('tasks')
      .update({ assigned_to: user_id })
      .eq('id', id)
      .select(`
        *,
        assigned_by:admins!assigned_by(id, email, full_name),
        assigned_to:users!assigned_to(id, email, full_name)
      `);

    if (error) return res.status(400).json({ error: error.message });

    res.json({
      message: 'Task assigned successfully',
      task: data[0]
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error assigning task.' });
  }
});

// Update task status (regular user)
router.patch('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, user_id } = req.body;

  if (!status || !user_id) return res.status(400).json({ error: 'Status and user_id required' });

  try {
    // Check task ownership
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('assigned_to')
      .eq('id', id)
      .single();

    if (taskError || !task) return res.status(404).json({ error: 'Task not found' });
    if (task.assigned_to !== user_id) return res.status(403).json({ error: 'Not authorized' });

    // Update status
    const { data, error } = await supabase
      .from('tasks')
      .update({ status })
      .eq('id', id)
      .select(`
        *,
        assigned_by:admins!assigned_by(id, email, full_name),
        assigned_to:users!assigned_to(id, email, full_name)
      `);

    if (error) return res.status(400).json({ error: error.message });

    res.json({ message: 'Task status updated', task: data[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error updating task.' });
  }
});

// Update task priority
router.patch('/:id/priority', async (req, res) => {
  const { id } = req.params;
  const { priority } = req.body;

  if (!priority) {
    return res.status(400).json({ error: 'Priority is required' });
  }

  if (!['low', 'medium', 'high'].includes(priority)) {
    return res.status(400).json({ error: 'Invalid priority value' });
  }

  try {
    const { data, error } = await supabase
      .from('tasks')
      .update({ priority })
      .eq('id', id)
      .select(`
        *,
        assigned_by:admins!assigned_by(id, email, full_name),
        assigned_to:users!assigned_to(id, email, full_name)
      `);

    if (error) return res.status(400).json({ error: error.message });

    res.json({ 
      message: 'Task priority updated successfully', 
      task: data[0]
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error updating task priority.' });
  }
});

// Get task statistics
router.get('/stats', async (req, res) => {
  try {
    // Get total tasks count
    const { count: totalTasks, error: totalError } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true });

    if (totalError) throw totalError;

    // Get assigned tasks count
    const { count: assignedTasks, error: assignedError } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .not('assigned_to', 'is', null);

    if (assignedError) throw assignedError;

    // Get in progress tasks count
    const { count: inProgressTasks, error: inProgressError } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'In Progress');

    if (inProgressError) throw inProgressError;

    // Get completed tasks count
    const { count: completedTasks, error: completedError } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Completed');

    if (completedError) throw completedError;

    res.json({
      totalTasks,
      assignedTasks,
      inProgressTasks,
      completedTasks
    });
  } catch (err) {
    console.error('Error fetching task statistics:', err);
    res.status(500).json({ error: 'Server error fetching task statistics.' });
  }
});

// Delete task
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const { error } = await supabase
            .from('tasks')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting task:', error);
            return res.status(400).json({ error: error.message });
        }

        res.json({ message: 'Task deleted successfully' });
    } catch (err) {
        console.error('Server error deleting task:', err);
        res.status(500).json({ error: 'Server error deleting task.' });
    }
});

// Get tasks for a specific user by email
router.get('/user/:email', async (req, res) => {
    const { email } = req.params;
    console.log('Fetching tasks for user email:', email);

    try {
        // First get the user's ID from their email
        console.log('Looking up user ID for email:', email);
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .single();

        if (userError) {
            console.error('Error finding user:', userError);
            return res.status(404).json({ error: 'User not found' });
        }

        if (!user) {
            console.error('No user found with email:', email);
            return res.status(404).json({ error: 'User not found' });
        }

        console.log('Found user ID:', user.id);

        // Then get all tasks assigned to this user
        console.log('Fetching tasks for user ID:', user.id);
        const { data: tasks, error: tasksError } = await supabase
            .from('tasks')
            .select(`
                *,
                assigned_by:admins!assigned_by (
                    id,
                    email,
                    full_name
                )
            `)
            .eq('assigned_to', user.id)
            .order('due_date', { ascending: true });

        if (tasksError) {
            console.error('Error fetching tasks:', tasksError);
            return res.status(500).json({ error: 'Failed to fetch tasks' });
        }

        console.log('Tasks fetched successfully:', tasks?.length || 0, 'tasks found');

        // Get task statistics
        const totalTasks = tasks?.length || 0;
        const inProgressTasks = tasks?.filter(task => task.status === 'In Progress').length || 0;
        const completedTasks = tasks?.filter(task => task.status === 'Completed').length || 0;

        console.log('Task statistics:', {
            totalTasks,
            inProgressTasks,
            completedTasks
        });

        res.json({
            tasks: tasks || [],
            stats: {
                totalTasks,
                inProgressTasks,
                completedTasks
            }
        });
    } catch (error) {
        console.error('Server error in /user/:email endpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get task details by ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    console.log('Fetching task details for ID:', id);

    try {
        const { data: task, error } = await supabase
            .from('tasks')
            .select(`
                *,
                assigned_by:admins!assigned_by (
                    id,
                    email,
                    full_name
                ),
                assigned_to:users!assigned_to (
                    id,
                    email,
                    full_name
                )
            `)
            .eq('id', id)
            .single();

        if (error) {
            console.error('Error fetching task details:', error);
            return res.status(404).json({ error: 'Task not found' });
        }

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        res.json(task);
    } catch (error) {
        console.error('Server error fetching task details:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get task comments
router.get('/:id/comments', async (req, res) => {
    const { id } = req.params;
    console.log('Fetching comments for task:', id);

    try {
        const { data: comments, error } = await supabase
            .from('task_comments')
            .select(`
                *,
                user:users!user_id (
                    full_name
                )
            `)
            .eq('task_id', id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching comments:', error);
            return res.status(500).json({ error: 'Failed to fetch comments' });
        }

        // Transform the comments to include user_name
        const transformedComments = comments.map(comment => ({
            ...comment,
            user_name: comment.user?.full_name || 'Unknown User'
        }));

        res.json(transformedComments);
    } catch (error) {
        console.error('Server error fetching comments:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add comment to task
router.post('/:id/comments', async (req, res) => {
    const { id } = req.params;
    const { content, user_id } = req.body;

    if (!content || !user_id) {
        return res.status(400).json({ error: 'Content and user_id are required' });
    }

    console.log('Adding comment to task:', { taskId: id, userId: user_id });

    try {
        // Verify task exists and user is assigned to it
        const { data: task, error: taskError } = await supabase
            .from('tasks')
            .select('assigned_to')
            .eq('id', id)
            .single();

        if (taskError || !task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        if (task.assigned_to !== user_id) {
            return res.status(403).json({ error: 'Not authorized to comment on this task' });
        }

        // Add the comment
        const { data: comment, error: commentError } = await supabase
            .from('task_comments')
            .insert([{
                task_id: id,
                user_id: user_id,
                content: content,
                created_at: new Date().toISOString()
            }])
            .select(`
                *,
                user:users!user_id (
                    full_name
                )
            `)
            .single();

        if (commentError) {
            console.error('Error adding comment:', commentError);
            return res.status(500).json({ error: 'Failed to add comment' });
        }

        // Transform the comment to include user_name
        const transformedComment = {
            ...comment,
            user_name: comment.user?.full_name || 'Unknown User'
        };

        res.status(201).json(transformedComment);
    } catch (error) {
        console.error('Server error adding comment:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
