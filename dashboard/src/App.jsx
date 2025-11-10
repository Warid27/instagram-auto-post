import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import AccountManager from './pages/AccountManager'
import CreatePost from './pages/CreatePost'
import PostQueue from './pages/PostQueue'
import BotStatus from './pages/BotStatus'
import Reviews from './pages/Reviews'
import Settings from './pages/Settings'

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Dashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/accounts"
              element={
                <ProtectedRoute>
                  <Layout>
                    <AccountManager />
                  </Layout>
                </ProtectedRoute>
              }
            />
          <Route
            path="/create"
            element={
              <ProtectedRoute>
                <Layout>
                  <CreatePost />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/queue"
            element={
              <ProtectedRoute>
                <Layout>
                  <PostQueue />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Layout>
                  <Settings />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/bot-status"
            element={
              <ProtectedRoute>
                <Layout>
                  <BotStatus />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/reviews"
            element={
              <ProtectedRoute>
                <Layout>
                  <Reviews />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
      </ToastProvider>
    </AuthProvider>
  )
}

export default App
