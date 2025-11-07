import express from 'express';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { authenticateUser } from '../middleware/auth.js';
import { uploadSingle } from '../middleware/upload.js';
import { uploadImage, deleteImage, getTransformUrl, validateImageFormat } from '../utils/cloudinary.js';

dotenv.config();

const router = express.Router();

// Initialize Supabase client for validation
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// POST /api/upload - Upload image to Cloudinary
router.post('/', authenticateUser, uploadSingle, async (req, res) => {
  try {
    // Validate file exists
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
        message: 'Please provide an image file'
      });
    }

    // Validate file format
    const validation = validateImageFormat(req.file);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: validation.error
      });
    }

    // Upload to Cloudinary
    let uploadResult;
    try {
      uploadResult = await uploadImage(req.file.buffer, {
        folder: 'instagram-automation/posts',
      });
    } catch (cloudinaryError) {
      console.error('Cloudinary upload error:', cloudinaryError);
      
      // Handle specific Cloudinary errors
      if (cloudinaryError.http_code === 400) {
        return res.status(400).json({
          success: false,
          error: 'Upload error',
          message: 'Invalid image format or corrupted file'
        });
      }
      
      if (cloudinaryError.http_code === 401) {
        return res.status(500).json({
          success: false,
          error: 'Configuration error',
          message: 'Cloudinary credentials are invalid. Please check your configuration.'
        });
      }

      if (cloudinaryError.http_code === 403 || cloudinaryError.http_code === 429) {
        return res.status(503).json({
          success: false,
          error: 'Service unavailable',
          message: 'Cloudinary quota exceeded or service unavailable. Please try again later.'
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Upload failed',
        message: cloudinaryError.message || 'Failed to upload image to Cloudinary'
      });
    }

    res.json({
      success: true,
      data: {
        url: uploadResult.url,
        public_id: uploadResult.public_id,
        width: uploadResult.width,
        height: uploadResult.height,
        format: uploadResult.format,
        size: uploadResult.size,
        aspectRatio: parseFloat(uploadResult.aspectRatio.toFixed(2)),
      }
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// DELETE /api/upload - Delete image from Cloudinary
router.delete('/', authenticateUser, async (req, res) => {
  try {
    const { public_id } = req.body;

    if (!public_id) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'public_id is required'
      });
    }

    // Validate user owns the image (check posts table)
    const userId = req.user.id;
    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select('id')
      .eq('user_id', userId)
      .eq('image_url', public_id)
      .limit(1);

    // Note: Since we're storing Cloudinary URLs, we need to check if the public_id is in the URL
    // For better validation, you might want to store public_id separately in the database
    // For now, we'll check if the public_id appears in any of the user's post URLs
    const { data: allPosts, error: allPostsError } = await supabase
      .from('posts')
      .select('image_url')
      .eq('user_id', userId);

    if (allPostsError) {
      console.error('Error checking posts:', allPostsError);
    }

    // Check if public_id is in any of the user's post URLs
    const ownsImage = allPosts?.some(post => 
      post.image_url && post.image_url.includes(public_id)
    );

    if (!ownsImage) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to delete this image'
      });
    }

    // Delete from Cloudinary
    let deleteResult;
    try {
      deleteResult = await deleteImage(public_id);
    } catch (cloudinaryError) {
      console.error('Cloudinary delete error:', cloudinaryError);
      
      if (cloudinaryError.http_code === 404) {
        return res.status(404).json({
          success: false,
          error: 'Not found',
          message: 'Image not found in Cloudinary'
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Delete failed',
        message: cloudinaryError.message || 'Failed to delete image from Cloudinary'
      });
    }

    if (!deleteResult.success) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: deleteResult.message || 'Image not found or already deleted'
      });
    }

    res.json({
      success: true,
      message: 'Image deleted successfully',
      data: deleteResult
    });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// GET /api/upload/transform - Get transformation URL for an image
router.get('/transform', authenticateUser, async (req, res) => {
  try {
    const { public_id, transformation } = req.query;

    if (!public_id) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'public_id is required'
      });
    }

    // Validate user owns the image (optional, but recommended)
    const userId = req.user.id;
    const { data: allPosts } = await supabase
      .from('posts')
      .select('image_url')
      .eq('user_id', userId);

    const ownsImage = allPosts?.some(post => 
      post.image_url && post.image_url.includes(public_id)
    );

    if (!ownsImage) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to transform this image'
      });
    }

    // Parse transformation if provided as string
    let transformOptions = {};
    if (transformation) {
      // Support predefined transformations: square, portrait, landscape
      if (['square', 'portrait', 'landscape'].includes(transformation)) {
        transformOptions = transformation;
      } else {
        // Try to parse as JSON
        try {
          transformOptions = JSON.parse(transformation);
        } catch (e) {
          // If not JSON, treat as Cloudinary transformation string
          transformOptions = transformation;
        }
      }
    }

    // Get transformation URL
    let transformUrl;
    try {
      transformUrl = getTransformUrl(public_id, transformOptions);
    } catch (transformError) {
      console.error('Transform error:', transformError);
      return res.status(500).json({
        success: false,
        error: 'Transform failed',
        message: transformError.message || 'Failed to generate transformation URL'
      });
    }

    res.json({
      success: true,
      data: {
        url: transformUrl,
        public_id,
        transformation: transformOptions,
        // Predefined transformations examples
        examples: {
          square: getTransformUrl(public_id, 'square'),
          portrait: getTransformUrl(public_id, 'portrait'),
          landscape: getTransformUrl(public_id, 'landscape'),
        }
      }
    });
  } catch (error) {
    console.error('Error getting transform URL:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// Error handler for multer errors
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large',
        message: 'File size must be less than 8MB'
      });
    }
    return res.status(400).json({
      success: false,
      error: 'Upload error',
      message: error.message
    });
  }
  
  if (error.message === 'Only JPG and PNG files are allowed' || 
      error.message === 'Only image files are allowed') {
    return res.status(400).json({
      success: false,
      error: 'Invalid file type',
      message: error.message
    });
  }

  next(error);
});

export default router;
