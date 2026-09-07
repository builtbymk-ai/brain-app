import type { Metadata } from 'next';
import { ResearchWorkspace } from '@/components/ResearchWorkspace';

export const metadata: Metadata = {
  title: 'Owner Research — BRAIN',
  description:
    'Research your e-commerce business from the outside in: structured intelligence, benchmarks and a decision-ready assessment of your next initiative.',
};

export default function OwnerResearchPage() {
  return <ResearchWorkspace userType="owner" />;
}
