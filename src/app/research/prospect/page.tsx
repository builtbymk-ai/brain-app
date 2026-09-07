import type { Metadata } from 'next';
import { ResearchWorkspace } from '@/components/ResearchWorkspace';

export const metadata: Metadata = {
  title: 'Prospect Research — BRAIN',
  description:
    'Research a prospect before the pitch: structured intelligence, evidence-backed problem identification and solution–evidence fit assessment.',
};

export default function ProspectResearchPage() {
  return <ResearchWorkspace userType="prospect" />;
}
