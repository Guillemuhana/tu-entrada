import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import EventsList from './EventsList'

export default function Panel() {
  const { isAdmin } = useAuth()
  if (!isAdmin) return <Navigate to="/scanner" replace />
  return <EventsList />
}
