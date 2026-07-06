import { Navigate } from 'react-router-dom';

export function SeasonPage() {
  return <Navigate replace to="/league?view=futures" />;
}
