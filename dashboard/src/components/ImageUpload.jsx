import { useState, useRef } from 'react'
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const ImageUpload = ({ onImageUploaded, onImageRemoved, initialUrl = null }) => {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [preview, setPreview] = useState(initialUrl)
  const [error, setError] = useState('')
  const [fileInfo, setFileInfo] = useState(null)
  const fileInputRef = useRef(null)
  const { user } = useAuth()

  const validateFile = (file) => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png']
    const maxSize = 8 * 1024 * 1024 // 8MB

    if (!validTypes.includes(file.type)) {
      return { valid: false, error: 'Only JPG and PNG files are allowed' }
    }

    if (file.size > maxSize) {
      return { valid: false, error: 'File size must be less than 8MB' }
    }

    return { valid: true }
  }

  const handleFile = async (file) => {
    setError('')
    const validation = validateFile(file)
    
    if (!validation.valid) {
      setError(validation.error)
      return
    }

    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => {
      setPreview(e.target.result)
    }
    reader.readAsDataURL(file)

    // Get image dimensions
    const img = new Image()
    img.onload = () => {
      setFileInfo({
        name: file.name,
        size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
        dimensions: `${img.width} × ${img.height}`,
        aspectRatio: (img.width / img.height).toFixed(2),
      })
    }
    img.src = URL.createObjectURL(file)

    // Upload to Cloudinary via backend API
    setUploading(true)
    setUploadProgress(0)

    try {
      // Create FormData for file upload
      const formData = new FormData()
      formData.append('image', file)

      // Get session token for authentication
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('You must be logged in to upload images')
      }

      // Get CSRF token
      const csrfResponse = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/csrf-token`, {
        method: 'GET',
        credentials: 'include',
      })
      const csrfData = await csrfResponse.json()
      const csrfToken = csrfData.csrfToken

      // Upload to backend Cloudinary endpoint
      setUploadProgress(30)
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/upload`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'x-csrf-token': csrfToken,
        },
        body: formData,
      })

      setUploadProgress(70)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Upload failed' }))
        throw new Error(errorData.message || errorData.error || 'Failed to upload image')
      }

      const result = await response.json()
      
      if (!result.success || !result.data?.url) {
        throw new Error(result.message || 'Upload failed - no URL returned')
      }

      setUploadProgress(100)
      // Use Cloudinary URL and public_id as path
      onImageUploaded(result.data.url, result.data.public_id)
    } catch (err) {
      console.error('Upload error:', err)
      setError(err.message || 'Failed to upload image')
      setPreview(null)
      setFileInfo(null)
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      handleFile(file)
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setDragging(false)
  }

  const handleFileInput = (e) => {
    const file = e.target.files[0]
    if (file) {
      handleFile(file)
    }
  }

  const handleRemove = () => {
    setPreview(null)
    setFileInfo(null)
    setError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    onImageRemoved()
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-gray-700">
        Image
      </label>

      {!preview ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
            transition-all duration-200
            ${
              dragging
                ? 'border-purple-500 bg-purple-50'
                : 'border-gray-300 hover:border-purple-400 hover:bg-gray-50'
            }
            ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png"
            onChange={handleFileInput}
            className="hidden"
            disabled={uploading}
          />

          {uploading ? (
            <div className="space-y-3">
              <Loader2 className="w-12 h-12 mx-auto text-purple-600 animate-spin" />
              <div>
                <p className="text-sm text-gray-600">Uploading...</p>
                <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">{uploadProgress}%</p>
              </div>
            </div>
          ) : (
            <>
              <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-sm text-gray-600">
                Click to upload or drag and drop
              </p>
              <p className="text-xs text-gray-500 mt-1">
                PNG, JPG up to 8MB
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="relative border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
          <div className="relative aspect-square max-h-96">
            <img
              src={preview}
              alt="Preview"
              className="w-full h-full object-contain"
            />
            <button
              onClick={handleRemove}
              className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>
          </div>
          {fileInfo && (
            <div className="px-4 py-3 bg-white border-t border-gray-200">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Dimensions</p>
                  <p className="font-medium text-gray-900">{fileInfo.dimensions}</p>
                </div>
                <div>
                  <p className="text-gray-500">Aspect Ratio</p>
                  <p className="font-medium text-gray-900">{fileInfo.aspectRatio}</p>
                </div>
                <div>
                  <p className="text-gray-500">Size</p>
                  <p className="font-medium text-gray-900">{fileInfo.size}</p>
                </div>
                <div>
                  <p className="text-gray-500">File</p>
                  <p className="font-medium text-gray-900 truncate">{fileInfo.name}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}
    </div>
  )
}

export default ImageUpload

