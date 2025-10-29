import { useState, useCallback } from 'react';

export const useReviewTracking = () => {
  const [reviewedSections, setReviewedSections] = useState<Set<string>>(new Set());
  const [editedSections, setEditedSections] = useState<Set<string>>(new Set());

  const markAsViewed = useCallback((sectionId: string) => {
    setReviewedSections(prev => new Set(prev).add(sectionId));
  }, []);

  const markAsEdited = useCallback((sectionId: string) => {
    setEditedSections(prev => new Set(prev).add(sectionId));
    setReviewedSections(prev => new Set(prev).add(sectionId));
  }, []);

  const getReviewStatus = useCallback((sectionId: string): 'not-viewed' | 'viewed' | 'edited' => {
    if (editedSections.has(sectionId)) return 'edited';
    if (reviewedSections.has(sectionId)) return 'viewed';
    return 'not-viewed';
  }, [editedSections, reviewedSections]);

  const resetTracking = useCallback(() => {
    setReviewedSections(new Set());
    setEditedSections(new Set());
  }, []);

  return {
    reviewedSections,
    editedSections,
    markAsViewed,
    markAsEdited,
    getReviewStatus,
    resetTracking,
  };
};
