import { useState, useRef, useEffect } from 'react'
import { Smile, Hash, FileText, Eye, EyeOff } from 'lucide-react'

const MAX_LENGTH = 2200

const CAPTION_TEMPLATES = {
  'Product Launch': '🎉 Exciting news! We\'re launching our new product! 🚀\n\n#NewProduct #Launch #Innovation',
  'Behind the Scenes': '✨ Behind the scenes of our latest project! ✨\n\n#BehindTheScenes #BTS #MakingOf',
  'Testimonial': '💬 "Testimonial quote here"\n\nThank you for your trust! 🙏\n\n#Testimonial #CustomerReview',
  'Educational': '📚 Did you know?\n\nEducational content here...\n\n#Education #Learn #Tips',
}

const COMMON_HASHTAGS = [
  '#instagram',
  '#photography',
  '#love',
  '#instagood',
  '#photooftheday',
  '#beautiful',
  '#fashion',
  '#happy',
  '#picoftheday',
  '#follow',
  '#art',
  '#nature',
  '#style',
  '#travel',
  '#food',
  '#life',
  '#motivation',
  '#inspiration',
  '#quote',
  '#success',
]

const CaptionEditor = ({ value, onChange, onPreview }) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showHashtags, setShowHashtags] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const textareaRef = useRef(null)
  const emojiPickerRef = useRef(null)

  const characterCount = value.length
  const remaining = MAX_LENGTH - characterCount

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target)
      ) {
        setShowEmojiPicker(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleChange = (e) => {
    const newValue = e.target.value
    if (newValue.length <= MAX_LENGTH) {
      onChange(newValue)
    }
  }

  const insertAtCursor = (text) => {
    const textarea = textareaRef.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newValue =
      value.substring(0, start) + text + value.substring(end)
    
    if (newValue.length <= MAX_LENGTH) {
      onChange(newValue)
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + text.length, start + text.length)
      }, 0)
    }
  }

  const applyTemplate = (templateName) => {
    const template = CAPTION_TEMPLATES[templateName]
    if (template && value.length + template.length <= MAX_LENGTH) {
      onChange(value ? `${value}\n\n${template}` : template)
      setShowTemplates(false)
    }
  }

  const addHashtag = (hashtag) => {
    const hashtagWithSpace = value && !value.endsWith(' ') ? ` ${hashtag}` : hashtag
    if (value.length + hashtagWithSpace.length <= MAX_LENGTH) {
      insertAtCursor(hashtagWithSpace)
      setShowHashtags(false)
    }
  }

  const commonEmojis = ['😀', '😍', '❤️', '🔥', '✨', '🎉', '🚀', '💪', '🙌', '👏', '👍', '💯', '⭐', '🎯', '💎']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          Caption
        </label>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center space-x-1 px-2 py-1 text-sm text-gray-600 hover:text-gray-900"
          >
            {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span>{showPreview ? 'Hide Preview' : 'Show Preview'}</span>
          </button>
        </div>
      </div>

      {showPreview ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="space-y-4">
            <div className="aspect-square w-64 bg-gray-100 rounded-lg flex items-center justify-center">
              <span className="text-gray-400 text-sm">Image Preview</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full"></div>
                <span className="font-semibold text-sm">username</span>
              </div>
              <div className="whitespace-pre-wrap text-sm">
                {value || <span className="text-gray-400">Your caption will appear here...</span>}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent resize-none"
              placeholder="Write a caption for your post..."
            />
            <div className="absolute bottom-3 right-3 flex items-center space-x-2">
              <span
                className={`text-xs ${
                  remaining < 50
                    ? 'text-red-600'
                    : remaining < 100
                    ? 'text-yellow-600'
                    : 'text-gray-500'
                }`}
              >
                {characterCount}/{MAX_LENGTH}
              </span>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center space-x-2 flex-wrap">
            {/* Emoji Picker */}
            <div className="relative" ref={emojiPickerRef}>
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="flex items-center space-x-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Smile className="w-4 h-4" />
                <span>Emoji</span>
              </button>
              {showEmojiPicker && (
                <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-10 w-64">
                  <div className="grid grid-cols-5 gap-2">
                    {commonEmojis.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => insertAtCursor(emoji)}
                        className="text-2xl hover:bg-gray-100 rounded p-1"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Hashtag Suggestions */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowHashtags(!showHashtags)}
                className="flex items-center space-x-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Hash className="w-4 h-4" />
                <span>Hashtags</span>
              </button>
              {showHashtags && (
                <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-10 w-64 max-h-48 overflow-y-auto">
                  <div className="space-y-1">
                    {COMMON_HASHTAGS.map((hashtag) => (
                      <button
                        key={hashtag}
                        type="button"
                        onClick={() => addHashtag(hashtag)}
                        className="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 rounded"
                      >
                        {hashtag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Templates */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTemplates(!showTemplates)}
                className="flex items-center space-x-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <FileText className="w-4 h-4" />
                <span>Templates</span>
              </button>
              {showTemplates && (
                <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg p-1 z-10 min-w-48">
                  {Object.keys(CAPTION_TEMPLATES).map((templateName) => (
                    <button
                      key={templateName}
                      type="button"
                      onClick={() => applyTemplate(templateName)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded"
                    >
                      {templateName}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default CaptionEditor

