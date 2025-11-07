import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { defaultUploadOptions } from '../config/cloudinary.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Upload image buffer to Cloudinary
 * @param {Buffer} buffer - Image buffer
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result with URL and metadata
 */
export const uploadImage = async (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      ...defaultUploadOptions,
      folder: `${defaultUploadOptions.folder}/posts`,
      public_id: options.public_id || `post_${Date.now()}_${uuidv4()}`,
      ...options,
    };

    // Create readable stream from buffer
    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(error);
        } else {
          resolve({
            url: result.secure_url,
            public_id: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
            size: result.bytes,
            aspectRatio: result.width / result.height,
            resource_type: result.resource_type,
            created_at: result.created_at,
          });
        }
      }
    );

    // Convert buffer to stream
    const stream = Readable.from(buffer);
    stream.pipe(uploadStream);
  });
};

/**
 * Delete image from Cloudinary
 * @param {string} public_id - Cloudinary public ID
 * @returns {Promise<Object>} Deletion result
 */
export const deleteImage = async (public_id) => {
  try {
    const result = await cloudinary.uploader.destroy(public_id);
    return {
      success: result.result === 'ok',
      result: result.result,
      message: result.result === 'ok' ? 'Image deleted successfully' : 'Image not found or already deleted',
    };
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw error;
  }
};

/**
 * Get transformation URL for an image
 * @param {string} public_id - Cloudinary public ID
 * @param {Object|string} transformation - Transformation options or string
 * @returns {string} Transformed image URL
 */
export const getTransformUrl = (public_id, transformation = {}) => {
  try {
    // If transformation is a string, use it directly
    if (typeof transformation === 'string') {
      return cloudinary.url(public_id, {
        secure: true,
        transformation: transformation,
      });
    }

    // Default Instagram-friendly transformations
    const defaultTransformations = {
      // Square crop (1:1) - Instagram square posts
      square: {
        width: 1080,
        height: 1080,
        crop: 'fill',
        quality: 'auto',
        format: 'auto',
      },
      // Portrait (4:5) - Instagram portrait posts
      portrait: {
        width: 1080,
        height: 1350,
        crop: 'fill',
        quality: 'auto',
        format: 'auto',
      },
      // Landscape (1.91:1) - Instagram landscape posts
      landscape: {
        width: 1080,
        height: 608,
        crop: 'fill',
        quality: 'auto',
        format: 'auto',
      },
    };

    // Use predefined transformation if provided as string key
    if (typeof transformation === 'string' && defaultTransformations[transformation]) {
      return cloudinary.url(public_id, {
        secure: true,
        transformation: defaultTransformations[transformation],
      });
    }

    // Merge with default transformations
    const finalTransformation = {
      ...transformation,
      quality: transformation.quality || 'auto',
      format: transformation.format || 'auto',
    };

    return cloudinary.url(public_id, {
      secure: true,
      transformation: finalTransformation,
    });
  } catch (error) {
    console.error('Cloudinary transform error:', error);
    throw error;
  }
};

/**
 * Validate image format
 * @param {Object} file - Multer file object
 * @returns {Object} Validation result
 */
export const validateImageFormat = (file) => {
  if (!file) {
    return {
      valid: false,
      error: 'No file provided',
    };
  }

  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png'];
  const allowedExtensions = ['jpg', 'jpeg', 'png'];

  if (!allowedMimes.includes(file.mimetype)) {
    return {
      valid: false,
      error: `Invalid file type: ${file.mimetype}. Only JPG and PNG are allowed.`,
    };
  }

  const fileExtension = file.originalname.split('.').pop()?.toLowerCase();
  if (!allowedExtensions.includes(fileExtension)) {
    return {
      valid: false,
      error: `Invalid file extension: ${fileExtension}. Only JPG and PNG are allowed.`,
    };
  }

  const maxSize = 8 * 1024 * 1024; // 8MB
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of 8MB. Current size: ${(file.size / 1024 / 1024).toFixed(2)}MB`,
    };
  }

  return {
    valid: true,
  };
};

/**
 * Get image info from Cloudinary
 * @param {string} public_id - Cloudinary public ID
 * @returns {Promise<Object>} Image information
 */
export const getImageInfo = async (public_id) => {
  try {
    const result = await cloudinary.api.resource(public_id);
    return {
      public_id: result.public_id,
      url: result.secure_url,
      width: result.width,
      height: result.height,
      format: result.format,
      size: result.bytes,
      aspectRatio: result.width / result.height,
      created_at: result.created_at,
    };
  } catch (error) {
    console.error('Cloudinary get info error:', error);
    throw error;
  }
};

