/**
 * Swipe Mode Types
 *
 * TypeScript type definitions for the Tinder-style swipe mode feature.
 * Used across SwipeMode screen and related components.
 */

import type { Photo } from '../database/queries/photos';

/**
 * Category of photos to display in swipe mode
 */
export type SwipeCategory = 'all' | 'screenshots' | 'duplicates' | 'largeFiles';

/**
 * Direction of swipe gesture
 */
export type SwipeDirection = 'left' | 'right';

/**
 * Individual swipe action for undo stack
 */
export interface SwipeAction {
  type: 'SWIPE_LEFT' | 'SWIPE_RIGHT';
  photoId: string;
  timestamp: number;
}

/**
 * Main state for SwipeMode screen
 */
export interface SwipeState {
  photos: Photo[];                    // Current batch of photos
  currentIndex: number;               // Index in photos array
  trashQueue: Set<string>;            // Photo IDs queued for deletion
  undoStack: SwipeAction[];           // Last 5 actions (circular buffer)
  totalCount: number;                 // Total photos in category
  reviewedCount: number;              // Photos user has swiped through
  loading: boolean;
  error: string | null;
  hasMore: boolean;                   // More photos to load
  isProcessing: boolean;              // True when emptying trash
}

/**
 * Actions for SwipeMode reducer
 */
export type SwipeReducerAction =
  | { type: 'LOAD_PHOTOS_START' }
  | { type: 'LOAD_PHOTOS_SUCCESS'; photos: Photo[]; total: number; hasMore: boolean }
  | { type: 'LOAD_PHOTOS_ERROR'; error: string }
  | { type: 'SWIPE_LEFT'; photoId: string }
  | { type: 'SWIPE_RIGHT'; photoId: string }
  | { type: 'UNDO' }
  | { type: 'EMPTY_TRASH_START' }
  | { type: 'EMPTY_TRASH_SUCCESS' }
  | { type: 'EMPTY_TRASH_ERROR'; error: string }
  | { type: 'LOAD_MORE_PHOTOS'; photos: Photo[] };

/**
 * Props for SwipeCard component
 */
export interface SwipeCardProps {
  photo: Photo;
  onSwipeLeft: (photoId: string) => void;
  onSwipeRight: (photoId: string) => void;
  isTopCard: boolean;
  zIndex: number;
}

/**
 * Props for SwipeControls component
 */
export interface SwipeControlsProps {
  onTrash: () => void;
  onKeep: () => void;
  disabled: boolean;
}

/**
 * Props for TrashQueuePanel component
 */
export interface TrashQueuePanelProps {
  trashCount: number;
  onEmptyTrash: () => void;
  isProcessing: boolean;
}

/**
 * Props for SwipeTutorialOverlay component
 */
export interface SwipeTutorialOverlayProps {
  visible: boolean;
  onDismiss: () => void;
}
