import React, { useState, useEffect, useReducer, useCallback } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useFocusEffect, usePreventRemove } from '@react-navigation/native';

// Types
import { RootStackParamList } from '../navigation/AppNavigator';
import type {
  SwipeState,
  SwipeReducerAction,
  SwipeCategory,
  MediaType,
  MediaItem,
} from '../types/swipe';
import type { Photo } from '../database/queries/photos';
import type { Video } from '../database/queries/videos';

// Database queries
import * as PhotoQueries from '../database/queries/photos';
import * as VideoQueries from '../database/queries/videos';
import * as DuplicateQueries from '../database/queries/duplicates';
import * as PreferenceQueries from '../database/queries/preferences';

// Services
import { UsageManager } from '../services/UsageManager';
import { mediaDeletionService } from '../services/MediaDeletionService';

// Components
import {
  LoadingSpinner,
  ErrorState,
  EmptyState,
  SwipeCard,
  SwipeControls,
  TrashQueuePanel,
  SwipeTutorialOverlay,
} from '../components';

// Theme
import { colors, spacingAliases as spacing } from '../theme';

type SwipeModeProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'SwipeMode'>;
  route: RouteProp<RootStackParamList, 'SwipeMode'>;
};

/**
 * Create initial state for swipe mode
 */
const createInitialState = (mediaType: MediaType): SwipeState => ({
  items: [],
  currentIndex: 0,
  trashQueue: new Set<string>(),
  undoStack: [],
  totalCount: 0,
  reviewedCount: 0,
  loading: true,
  error: null,
  hasMore: true,
  isProcessing: false,
  mediaType,
});

/**
 * Reducer for swipe mode state management
 */
function swipeReducer(state: SwipeState, action: SwipeReducerAction): SwipeState {
  switch (action.type) {
    case 'LOAD_ITEMS_START':
      return { ...state, loading: true, error: null };

    case 'LOAD_ITEMS_SUCCESS':
      return {
        ...state,
        items: action.items,
        totalCount: action.total,
        hasMore: action.hasMore,
        loading: false,
        error: null,
      };

    case 'LOAD_ITEMS_ERROR':
      return { ...state, loading: false, error: action.error };

    case 'SWIPE_LEFT': {
      const newTrashQueue = new Set(state.trashQueue);
      newTrashQueue.add(action.mediaId);

      const newUndoStack = [...state.undoStack];
      if (newUndoStack.length >= 5) {
        newUndoStack.shift(); // Remove oldest action (circular buffer)
      }
      newUndoStack.push({
        type: 'SWIPE_LEFT',
        mediaId: action.mediaId,
        timestamp: Date.now(),
      });

      return {
        ...state,
        currentIndex: state.currentIndex + 1,
        reviewedCount: state.reviewedCount + 1,
        trashQueue: newTrashQueue,
        undoStack: newUndoStack,
      };
    }

    case 'SWIPE_RIGHT': {
      const newUndoStack = [...state.undoStack];
      if (newUndoStack.length >= 5) {
        newUndoStack.shift();
      }
      newUndoStack.push({
        type: 'SWIPE_RIGHT',
        mediaId: action.mediaId,
        timestamp: Date.now(),
      });

      return {
        ...state,
        currentIndex: state.currentIndex + 1,
        reviewedCount: state.reviewedCount + 1,
        undoStack: newUndoStack,
      };
    }

    case 'UNDO': {
      if (state.undoStack.length === 0 || state.currentIndex === 0) {
        return state; // Nothing to undo
      }

      const lastAction = state.undoStack[state.undoStack.length - 1];
      const newUndoStack = state.undoStack.slice(0, -1);
      const newTrashQueue = new Set(state.trashQueue);

      if (lastAction.type === 'SWIPE_LEFT') {
        newTrashQueue.delete(lastAction.mediaId);
      }

      return {
        ...state,
        currentIndex: state.currentIndex - 1,
        reviewedCount: state.reviewedCount - 1,
        trashQueue: newTrashQueue,
        undoStack: newUndoStack,
      };
    }

    case 'EMPTY_TRASH_START':
      return { ...state, isProcessing: true, error: null };

    case 'EMPTY_TRASH_SUCCESS':
      return {
        ...state,
        isProcessing: false,
        trashQueue: new Set<string>(),
        undoStack: [],
      };

    case 'EMPTY_TRASH_ERROR':
      return { ...state, isProcessing: false, error: action.error };

    case 'LOAD_MORE_ITEMS':
      return {
        ...state,
        items: [...state.items, ...action.items],
        hasMore: action.items.length > 0,
      };

    default:
      return state;
  }
}

/**
 * Get category display name
 */
function getCategoryName(category: SwipeCategory, mediaType: MediaType): string {
  switch (category) {
    case 'all':
      return mediaType === 'photo' ? 'All Photos' : 'All Videos';
    case 'screenshots':
      return 'Screenshots';
    case 'duplicates':
      return 'Duplicates';
    case 'largeFiles':
      return 'Large Files';
    case 'videos':
      return 'All Videos';
    case 'largeVideos':
      return 'Large Videos';
    default:
      return mediaType === 'photo' ? 'Photos' : 'Videos';
  }
}

export default function SwipeMode({ navigation, route }: SwipeModeProps) {
  const { category, mediaType } = route.params;
  const [state, dispatch] = useReducer(swipeReducer, createInitialState(mediaType));
  const [showTutorial, setShowTutorial] = useState(false);
  const [allowExit, setAllowExit] = useState(false);

  /**
   * Load media items (photos or videos) based on category and mediaType
   */
  const loadItems = useCallback(async () => {
    try {
      dispatch({ type: 'LOAD_ITEMS_START' });

      let items: MediaItem[] = [];
      let total = 0;
      const limit = 50; // Initial batch size

      // Load based on mediaType and category
      if (mediaType === 'photo') {
        switch (category) {
          case 'all':
            items = await PhotoQueries.getAllPhotos({ limit, offset: 0 });
            total = items.length;
            break;

          case 'screenshots':
            items = await PhotoQueries.getScreenshots({ limit, offset: 0 });
            total = items.length;
            break;

          case 'largeFiles':
            items = await PhotoQueries.getLargeFiles(5 * 1024 * 1024, { limit, offset: 0 });
            total = items.length;
            break;

          case 'duplicates': {
            // Load duplicate groups and flatten to individual photos
            const groups = await DuplicateQueries.getDuplicateGroups();
            items = [];
            total = 0;
            // TODO: Implement proper duplicate photo loading
            break;
          }

          default:
            items = [];
            total = 0;
        }
      } else {
        // Load videos
        switch (category) {
          case 'videos':
          case 'all':
            items = await VideoQueries.getAllVideos({ limit, offset: 0 });
            total = items.length;
            break;

          case 'largeVideos':
          case 'largeFiles':
            items = await VideoQueries.getLargeVideos(10 * 1024 * 1024, limit); // Videos > 10MB
            total = items.length;
            break;

          default:
            items = [];
            total = 0;
        }
      }

      dispatch({
        type: 'LOAD_ITEMS_SUCCESS',
        items,
        total,
        hasMore: items.length >= limit,
      });
    } catch (err) {
      console.error('[SwipeMode] Error loading items:', err);
      dispatch({
        type: 'LOAD_ITEMS_ERROR',
        error: err instanceof Error ? err.message : `Failed to load ${mediaType === 'photo' ? 'photos' : 'videos'}`,
      });
    }
  }, [category, mediaType]);

  /**
   * Load more items (pagination)
   */
  const loadMoreItems = useCallback(async () => {
    if (!state.hasMore || state.loading || state.items.length - state.currentIndex > 10) {
      return; // Don't load if already loading or enough items in buffer
    }

    try {
      const limit = 50;
      const offset = state.items.length;
      let moreItems: MediaItem[] = [];

      if (mediaType === 'photo') {
        switch (category) {
          case 'all':
            moreItems = await PhotoQueries.getAllPhotos({ limit, offset });
            break;

          case 'screenshots':
            moreItems = await PhotoQueries.getScreenshots({ limit, offset });
            break;

          case 'largeFiles':
            moreItems = await PhotoQueries.getLargeFiles(5 * 1024 * 1024, { limit, offset });
            break;

          case 'duplicates':
            moreItems = [];
            break;

          default:
            moreItems = [];
        }
      } else {
        switch (category) {
          case 'videos':
          case 'all':
            moreItems = await VideoQueries.getAllVideos({ limit, offset });
            break;

          case 'largeVideos':
          case 'largeFiles':
            // Note: getLargeVideos doesn't support offset, so we can't paginate large videos properly
            // For now, just return empty array (all loaded in initial load)
            moreItems = [];
            break;

          default:
            moreItems = [];
        }
      }

      dispatch({ type: 'LOAD_MORE_ITEMS', items: moreItems });
    } catch (err) {
      console.error('[SwipeMode] Error loading more items:', err);
    }
  }, [category, mediaType, state.hasMore, state.loading, state.items.length, state.currentIndex]);

  /**
   * Check if tutorial should be shown
   */
  const checkTutorial = useCallback(async () => {
    try {
      const seen = await PreferenceQueries.getPreference('swipe_mode_tutorial_seen');
      if (!seen || seen === 'false') {
        setShowTutorial(true);
      }
    } catch (err) {
      console.error('[SwipeMode] Error checking tutorial preference:', err);
      // Show tutorial on error to be safe
      setShowTutorial(true);
    }
  }, []);

  /**
   * Handle tutorial dismissal
   */
  const handleTutorialDismiss = useCallback(async () => {
    try {
      await PreferenceQueries.setPreference('swipe_mode_tutorial_seen', 'true');
      setShowTutorial(false);
    } catch (err) {
      console.error('[SwipeMode] Error saving tutorial preference:', err);
      setShowTutorial(false);
    }
  }, []);

  /**
   * Handle swipe left (trash)
   */
  const handleSwipeLeft = useCallback((mediaId: string) => {
    dispatch({ type: 'SWIPE_LEFT', mediaId });

    // Load more items if approaching end
    if (state.items.length - state.currentIndex <= 10) {
      loadMoreItems();
    }
  }, [state.items.length, state.currentIndex, loadMoreItems]);

  /**
   * Handle swipe right (keep)
   */
  const handleSwipeRight = useCallback((mediaId: string) => {
    dispatch({ type: 'SWIPE_RIGHT', mediaId });

    // Load more items if approaching end
    if (state.items.length - state.currentIndex <= 10) {
      loadMoreItems();
    }
  }, [state.items.length, state.currentIndex, loadMoreItems]);

  /**
   * Handle undo action
   */
  const handleUndo = useCallback(() => {
    if (state.undoStack.length === 0 || state.currentIndex === 0) {
      Alert.alert('Nothing to Undo', 'You haven\'t swiped any photos yet.');
      return;
    }

    dispatch({ type: 'UNDO' });
  }, [state.undoStack.length, state.currentIndex]);

  /**
   * Handle empty trash (batch deletion)
   */
  const handleEmptyTrash = useCallback(async () => {
    if (state.trashQueue.size === 0) {
      return;
    }

    const trashCount = state.trashQueue.size;
    const trashArray = Array.from(state.trashQueue);

    // Show confirmation
    Alert.alert(
      'Empty Trash',
      `Are you sure you want to delete ${trashCount} photo${trashCount > 1 ? 's' : ''}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              dispatch({ type: 'EMPTY_TRASH_START' });

              // Check freemium limits
              const usageManager = new UsageManager();
              const { allowed, remaining } = await usageManager.canCleanupDuplicates(trashCount);

              if (!allowed) {
                dispatch({ type: 'EMPTY_TRASH_ERROR', error: 'Limit reached' });
                Alert.alert(
                  'Cleanup Limit Reached',
                  `You can only delete ${remaining} more photos this month on the free plan. Upgrade to Pro for unlimited deletions.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Upgrade', onPress: () => navigation.navigate('Paywall') },
                  ]
                );
                return;
              }

              // Perform batch deletion (both device and database)
              // MediaDeletionService handles both photos and videos
              const result = await mediaDeletionService.deleteMedia(trashArray, mediaType);

              if (!result.success) {
                console.error('[SwipeMode] Some deletions failed:', result.errors);
                // Show partial success message if some deletions failed
                if (result.deletedCount > 0) {
                  Alert.alert(
                    'Partial Success',
                    `${result.deletedCount} of ${trashCount} ${mediaType === 'photo' ? 'photos' : 'videos'} deleted. Some deletions failed.`
                  );
                }
              }

              // Record cleanup usage for successfully deleted items
              await usageManager.recordCleanup(result.deletedCount);

              // Calculate space saved (sum file sizes)
              const deletedItems = state.items.filter(item => trashArray.includes(item.id));
              const spaceSaved = deletedItems.reduce((sum, item) => sum + item.file_size, 0);
              const spaceSavedMB = (spaceSaved / (1024 * 1024)).toFixed(1);

              dispatch({ type: 'EMPTY_TRASH_SUCCESS' });

              // Reset exit prevention
              setAllowExit(false);

              // Only show success alert if deletion was fully successful
              if (result.success && result.deletedCount === trashCount) {
                const itemType = mediaType === 'photo' ? 'photo' : 'video';
                Alert.alert(
                  'Success!',
                  `${trashCount} ${itemType}${trashCount > 1 ? 's' : ''} deleted. ${spaceSavedMB} MB freed.`
                );
              }

              // Remove deleted items from state
              const updatedItems = state.items.filter(item => !trashArray.includes(item.id));
              dispatch({ type: 'LOAD_ITEMS_SUCCESS', items: updatedItems, total: updatedItems.length, hasMore: state.hasMore });
            } catch (err) {
              console.error('[SwipeMode] Error emptying trash:', err);
              dispatch({
                type: 'EMPTY_TRASH_ERROR',
                error: err instanceof Error ? err.message : 'Failed to delete photos',
              });
              Alert.alert('Error', 'Failed to delete photos. Please try again.');
            }
          },
        },
      ]
    );
  }, [state.trashQueue, state.items, state.hasMore, navigation, mediaType]);

  // Load items on mount and when category changes
  useEffect(() => {
    loadItems();
    checkTutorial();
  }, [loadItems, checkTutorial]);

  // Reload items when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [loadItems])
  );

  // Prevent accidental exit when trash queue has items (using usePreventRemove hook)
  usePreventRemove(state.trashQueue.size > 0 && !allowExit, () => {
    const trashCount = state.trashQueue.size;

    Alert.alert(
      'Unsaved Progress',
      `You have ${trashCount} item${trashCount > 1 ? 's' : ''} in trash. What would you like to do?`,
      [
        {
          text: 'Exit Anyway',
          style: 'destructive',
          onPress: () => {
            // Allow exit and navigate back
            setAllowExit(true);
            // Use setTimeout to ensure state updates before navigation
            setTimeout(() => navigation.goBack(), 0);
          },
        },
        {
          text: 'Stay & Delete',
          style: 'default',
          onPress: () => handleEmptyTrash(),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  });

  // Update header with progress and disable back button menu
  useEffect(() => {
    navigation.setOptions({
      title: `${getCategoryName(category, mediaType)} (${state.reviewedCount}/${state.totalCount})`,
      headerBackButtonMenuEnabled: false, // Disable long-press back button menu on iOS
      headerRight: () => (
        <Text
          onPress={handleUndo}
          style={[
            styles.undoButton,
            { color: state.undoStack.length === 0 ? colors.neutral.disabled : colors.primary.default },
          ]}
        >
          Undo
        </Text>
      ),
    });
  }, [navigation, category, mediaType, state.reviewedCount, state.totalCount, state.undoStack.length, handleUndo]);

  // Get current item and next items for rendering
  const currentItem = state.items[state.currentIndex];
  const nextItems = state.items.slice(state.currentIndex + 1, state.currentIndex + 3);

  // Render loading state
  if (state.loading && state.items.length === 0) {
    return (
      <View style={styles.container}>
        <LoadingSpinner label={`Loading ${mediaType === 'photo' ? 'photos' : 'videos'}...`} size="large" />
      </View>
    );
  }

  // Render error state
  if (state.error && state.items.length === 0) {
    return (
      <View style={styles.container}>
        <ErrorState
          type="generic"
          onRetry={loadItems}
        />
      </View>
    );
  }

  // Render empty state
  if (state.items.length === 0) {
    const itemType = mediaType === 'photo' ? 'Photos' : 'Videos';
    return (
      <View style={styles.container}>
        <EmptyState
          icon={mediaType === 'photo' ? '📷' : '🎬'}
          title={`No ${itemType} Found`}
          message={`No ${getCategoryName(category, mediaType).toLowerCase()} to review.`}
          action={{
            label: "Go Back",
            onPress: () => navigation.goBack(),
          }}
        />
      </View>
    );
  }

  // Render end-of-queue state
  if (state.currentIndex >= state.items.length) {
    const itemType = mediaType === 'photo' ? 'photo' : 'video';
    return (
      <View style={styles.container}>
        <EmptyState
          icon="🎉"
          title="All Done!"
          message={`You reviewed ${state.reviewedCount} ${itemType}${state.reviewedCount > 1 ? 's' : ''}. ${state.trashQueue.size} queued for deletion.`}
          action={{
            label: state.trashQueue.size > 0 ? 'Empty Trash' : 'Go Back',
            onPress: state.trashQueue.size > 0 ? handleEmptyTrash : () => navigation.goBack(),
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Render swipe cards (current + next 2) */}
      <View style={styles.cardStack}>
        {/* Render cards in reverse order so top card is last (highest z-index) */}
        {[...nextItems].reverse().map((item, index) => (
          <SwipeCard
            key={item.id}
            item={item}
            mediaType={mediaType}
            onSwipeLeft={handleSwipeLeft}
            onSwipeRight={handleSwipeRight}
            isTopCard={false}
            zIndex={index}
          />
        ))}
        {currentItem && (
          <SwipeCard
            key={currentItem.id}
            item={currentItem}
            mediaType={mediaType}
            onSwipeLeft={handleSwipeLeft}
            onSwipeRight={handleSwipeRight}
            isTopCard={true}
            zIndex={nextItems.length + 1}
          />
        )}
      </View>

      {/* Swipe controls (alternative tap buttons) */}
      <SwipeControls
        onTrash={() => currentItem && handleSwipeLeft(currentItem.id)}
        onKeep={() => currentItem && handleSwipeRight(currentItem.id)}
        disabled={!currentItem || state.isProcessing}
      />

      {/* Trash queue panel at bottom */}
      <TrashQueuePanel
        trashCount={state.trashQueue.size}
        onEmptyTrash={handleEmptyTrash}
        isProcessing={state.isProcessing}
      />

      {/* Tutorial overlay (first-time only) */}
      <SwipeTutorialOverlay
        visible={showTutorial}
        onDismiss={handleTutorialDismiss}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.background,
  },
  undoButton: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: spacing.md,
  },
  cardStack: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
