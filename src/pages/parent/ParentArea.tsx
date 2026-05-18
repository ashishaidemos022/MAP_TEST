// src/pages/parent/ParentArea.tsx
// Replaces the shelved ParentRoot — NO parent_v2 flag, NO legacy branch.
// One nested Routes tree under the ParentShell layout.
import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireActiveStudent } from '../../lib/activeStudent'
import ParentShell from '../../components/parent/ParentShell'
import Classroom from './Classroom'
import KidDetail from './KidDetail'
import TestsAndBanks from './TestsAndBanks'
import SaveVettedBank from './SaveVettedBank'
import NewCustomBank from './NewCustomBank'
import BankDetail from './BankDetail'
import AiStudio from './AiStudio'
import NewCustomQuestion from './NewCustomQuestion'
import NewCustomPassage from './NewCustomPassage'
import CustomTestBuilder from './CustomTestBuilder'

export default function ParentArea() {
  return (
    <Routes>
      <Route element={<ParentShell />}>
        <Route index element={<Classroom />} />
        <Route path="kids/:id" element={<KidDetail />} />
        <Route path="tests" element={<TestsAndBanks />} />
        <Route path="ai-studio" element={<AiStudio />} />
        {/* Old paths preserved as redirects so existing links never dead-end */}
        <Route
          path="custom-bank"
          element={<Navigate to="/parent/ai-studio?tab=review" replace />}
        />
        <Route
          path="connect-ai"
          element={<Navigate to="/parent/ai-studio?tab=connect" replace />}
        />
      </Route>
      {/* Full-screen sub-pages (no shell chrome); compose pages keep the
          active-student guard that protects their existing behavior. */}
      <Route
        path="banks/new"
        element={
          <RequireActiveStudent>
            <SaveVettedBank />
          </RequireActiveStudent>
        }
      />
      <Route
        path="banks/new-custom"
        element={
          <RequireActiveStudent>
            <NewCustomBank />
          </RequireActiveStudent>
        }
      />
      <Route path="banks/:id" element={<BankDetail />} />
      <Route
        path="custom-test"
        element={
          <RequireActiveStudent>
            <CustomTestBuilder />
          </RequireActiveStudent>
        }
      />
      <Route path="custom-bank/new-question" element={<NewCustomQuestion />} />
      <Route path="custom-bank/new-passage" element={<NewCustomPassage />} />
      <Route path="*" element={<Navigate to="/parent" replace />} />
    </Routes>
  )
}
