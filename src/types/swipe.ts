/**
 * Swipe Mode Types
 *
 * TypeScript type definitions for the Tinder-style swipe mode feature.
 * Used across SwipeMode screen and related components.
 * Supports both photos and videos.
 */

import type { Photo } from '../database/queries/photos';
import type { Video } from '../database/queries/videos';

/**
 * Media type for swipe mode
 */
export type MediaType = 'photo' | 'video';

/**
 * Union type for media items (photos or videos)
 */
export type MediaItem = Photo | Video;

/**
 * Category of media to display in swipe mode
 */
export type SwipeCategory =
  // Photo categories
  | 'all'
  | 'screenshots'
  | 'duplicates'
  | 'largeFiles'
  // Video categories
  | 'videos'
  | 'largeVideos';

/**
 * Direction of swipe gesture
 */
export type SwipeDirection = 'left' | 'right';

/**
 * Individual swipe action for undo stack
 */
export interface SwipeAction {
  type: 'SWIPE_LEFT' | 'SWIPE_RIGHT';
  mediaId: string;                    // Photo or video ID
  timestamp: number;
}

/**
 * Main state for SwipeMode screen
 */
export interface SwipeState {
  items: MediaItem[];                 // Current batch of photos or videos
  currentIndex: number;               // Index in items array
  trashQueue: Set<string>;            // Media IDs queued for deletion
  undoStack: SwipeAction[];           // Last 5 actions (circular buffer)
  totalCount: number;                 // Total items in category
  reviewedCount: number;              // Items user has swiped through
  loading: boolean;
  error: string | null;
  hasMore: boolean;                   // More items to load
  isProcessing: boolean;              // True when emptying trash
  mediaType: MediaType;               // Whether showing photos or videos
}

/**
 * Actions for SwipeMode reducer
 */
export type SwipeReducerAction =
  | { type: 'LOAD_ITEMS_START' }
  | { type: 'LOAD_ITEMS_SUCCESS'; items: MediaItem[]; total: number; hasMore: boolean }
  | { type: 'LOAD_ITEMS_ERROR'; error: string }
  | { type: 'SWIPE_LEFT'; mediaId: string }
  | { type: 'SWIPE_RIGHT'; mediaId: string }
  | { type: 'UNDO' }
  | { type: 'EMPTY_TRASH_START' }
  | { type: 'EMPTY_TRASH_SUCCESS' }
  | { type: 'EMPTY_TRASH_ERROR'; error: string }
  | { type: 'LOAD_MORE_ITEMS'; items: MediaItem[] };

/**
 * Props for SwipeCard component
 */
export interface SwipeCardProps {
  item: MediaItem;                    // Photo or video
  mediaType: MediaType;               // Type of media
  onSwipeLeft: (mediaId: string) => void;
  onSwipeRight: (mediaId: string) => void;
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
