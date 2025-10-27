const Skill = require('../models/Skill');

// Get all skills with search and filter
exports.getAllSkills = async (req, res) => {
    try {
        const { search = '', category = 'all', isActive = 'all', sort = '-createdAt' } = req.query;
        
        let query = {};
        
        // Search by name, description, or tags
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { tags: { $regex: search, $options: 'i' } }
            ];
        }
        
        // Filter by category
        if (category !== 'all') {
            query.category = category;
        }
        
        // Filter by active status
        if (isActive !== 'all') {
            query.isActive = isActive === 'true';
        }
        
        const skills = await Skill.find(query)
            .populate('createdBy', 'name email')
            .sort(sort);
        
        res.json({
            success: true,
            count: skills.length,
            skills
        });
    } catch (error) {
        console.error('Error getting skills:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting skills',
            error: error.message
        });
    }
};

// Get skill by ID
exports.getSkillById = async (req, res) => {
    try {
        const skill = await Skill.findById(req.params.id)
            .populate('createdBy', 'name email');
        
        if (!skill) {
            return res.status(404).json({
                success: false,
                message: 'Skill not found'
            });
        }
        
        res.json({
            success: true,
            skill
        });
    } catch (error) {
        console.error('Error getting skill:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting skill',
            error: error.message
        });
    }
};

// Create new skill
exports.createSkill = async (req, res) => {
    try {
        const { name, category, description, subcategory, tags, isActive } = req.body;
        
        // Check if skill already exists
        const existingSkill = await Skill.findOne({ name: { $regex: `^${name}$`, $options: 'i' } });
        if (existingSkill) {
            return res.status(400).json({
                success: false,
                message: 'A skill with this name already exists'
            });
        }
        
        const skill = await Skill.create({
            name,
            category,
            description,
            subcategory,
            tags: tags || [],
            isActive: isActive !== undefined ? isActive : true,
            createdBy: req.admin?._id || null
        });
        
        res.status(201).json({
            success: true,
            message: 'Skill created successfully',
            skill
        });
    } catch (error) {
        console.error('Error creating skill:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating skill',
            error: error.message
        });
    }
};

// Update skill
exports.updateSkill = async (req, res) => {
    try {
        const { name, category, description, subcategory, tags, isActive } = req.body;
        
        // Check if new name conflicts with existing skill
        if (name) {
            const existingSkill = await Skill.findOne({ 
                name: { $regex: `^${name}$`, $options: 'i' },
                _id: { $ne: req.params.id }
            });
            
            if (existingSkill) {
                return res.status(400).json({
                    success: false,
                    message: 'A skill with this name already exists'
                });
            }
        }
        
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (category !== undefined) updateData.category = category;
        if (description !== undefined) updateData.description = description;
        if (subcategory !== undefined) updateData.subcategory = subcategory;
        if (tags !== undefined) updateData.tags = tags;
        if (isActive !== undefined) updateData.isActive = isActive;
        
        const skill = await Skill.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );
        
        if (!skill) {
            return res.status(404).json({
                success: false,
                message: 'Skill not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Skill updated successfully',
            skill
        });
    } catch (error) {
        console.error('Error updating skill:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating skill',
            error: error.message
        });
    }
};

// Delete skill
exports.deleteSkill = async (req, res) => {
    try {
        const skill = await Skill.findByIdAndDelete(req.params.id);
        
        if (!skill) {
            return res.status(404).json({
                success: false,
                message: 'Skill not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Skill deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting skill:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting skill',
            error: error.message
        });
    }
};

// Get popular skills
exports.getPopularSkills = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const skills = await Skill.getPopularSkills(limit);
        
        res.json({
            success: true,
            skills
        });
    } catch (error) {
        console.error('Error getting popular skills:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting popular skills',
            error: error.message
        });
    }
};

// Get skills by category
exports.getSkillsByCategory = async (req, res) => {
    try {
        const { category } = req.params;
        const skills = await Skill.getByCategory(category);
        
        res.json({
            success: true,
            category,
            count: skills.length,
            skills
        });
    } catch (error) {
        console.error('Error getting skills by category:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting skills by category',
            error: error.message
        });
    }
};

// Get skill categories
exports.getCategories = async (req, res) => {
    try {
        const categories = [
            'Programming & Development',
            'Design & Creative',
            'Business & Finance',
            'Marketing & Sales',
            'Writing & Translation',
            'Music & Audio',
            'Video & Animation',
            'Photography',
            'Health & Fitness',
            'Teaching & Academics',
            'Lifestyle',
            'Data & Analytics',
            'AI & Machine Learning',
            'Other'
        ];
        
        // Get count for each category
        const categoriesWithCount = await Promise.all(
            categories.map(async (category) => {
                const count = await Skill.countDocuments({ category, isActive: true });
                return { name: category, count };
            })
        );
        
        res.json({
            success: true,
            categories: categoriesWithCount
        });
    } catch (error) {
        console.error('Error getting categories:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting categories',
            error: error.message
        });
    }
};

// Bulk create skills (for seeding)
exports.bulkCreateSkills = async (req, res) => {
    try {
        const { skills } = req.body;
        
        if (!Array.isArray(skills) || skills.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide an array of skills'
            });
        }
        
        const createdSkills = await Skill.insertMany(
            skills.map(skill => ({
                ...skill,
                createdBy: req.admin?._id || null
            })),
            { ordered: false } // Continue even if some fail
        );
        
        res.status(201).json({
            success: true,
            message: `${createdSkills.length} skills created successfully`,
            skills: createdSkills
        });
    } catch (error) {
        console.error('Error bulk creating skills:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating skills',
            error: error.message
        });
    }
};
