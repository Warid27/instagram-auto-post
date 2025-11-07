import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true, // Use HTTPS
});

// Default upload options
export const defaultUploadOptions = {
  folder: process.env.CLOUDINARY_FOLDER || 'instagram-automation',
  resource_type: 'auto',
  allowed_formats: ['jpg', 'jpeg', 'png'],
  transformation: [
    {
      quality: 'auto',
      fetch_format: 'auto',
    },
  ],
};

// Verify Cloudinary configuration
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.warn('⚠️  Cloudinary credentials not found in environment variables');
  console.warn('   Image upload functionality will not work without proper configuration');
}

export default cloudinary;

