import React, { useState, useEffect, useReducer, useCallback } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';

// Types
import { RootStackParamList } from '../navigation/AppNavigator';
import type {
  SwipeState,
  SwipeReducerAction,
  SwipeCategory,
} from '../types/swipe';
import type { Photo } from '../database/queries/photos';

// Database queries
import * as PhotoQueries from '../database/queries/photos';
import * as DuplicateQueries from '../database/queries/duplicates';
import * as PreferenceQueries from '../database/queries/preferences';

// Services
import { UsageManager } from '../services/UsageManager';
import { photoDeletionService } from '../services/PhotoDeletionService';

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
 * Initial state for swipe mode
 */
const initialState: SwipeState = {
  photos: [],
  currentIndex: 0,
  trashQueue: new Set<string>(),
  undoStack: [],
  totalCount: 0,
  reviewedCount: 0,
  loading: true,
  error: null,
  hasMore: true,
  isProcessing: false,
};

/**
 * Reducer for swipe mode state management
 */
function swipeReducer(state: SwipeState, action: SwipeReducerAction): SwipeState {
  switch (action.type) {
    case 'LOAD_PHOTOS_START':
      return { ...state, loading: true, error: null };

    case 'LOAD_PHOTOS_SUCCESS':
      return {
        ...state,
        photos: action.photos,
        totalCount: action.total,
        hasMore: action.hasMore,
        loading: false,
        error: null,
      };

    case 'LOAD_PHOTOS_ERROR':
      return { ...state, loading: false, error: action.error };

    case 'SWIPE_LEFT': {
      const newTrashQueue = new Set(state.trashQueue);
      newTrashQueue.add(action.photoId);

      const newUndoStack = [...state.undoStack];
      if (newUndoStack.length >= 5) {
        newUndoStack.shift(); // Remove oldest action (circular buffer)
      }
      newUndoStack.push({
        type: 'SWIPE_LEFT',
        photoId: action.photoId,
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
        photoId: action.photoId,
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
        newTrashQueue.delete(lastAction.photoId);
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

    case 'LOAD_MORE_PHOTOS':
      return {
        ...state,
        photos: [...state.photos, ...action.photos],
        hasMore: action.photos.length > 0,
      };

    default:
      return state;
  }
}

/**
 * Get category display name
 */
function getCategoryName(category: SwipeCategory): string {
  switch (category) {
    case 'all':
      return 'All Photos';
    case 'screenshots':
      return 'Screenshots';
    case 'duplicates':
      return 'Duplicates';
    case 'largeFiles':
      return 'Large Files';
    default:
      return 'Photos';
  }
}

export default function SwipeMode({ navigation, route }: SwipeModeProps) {
  const { category } = route.params;
  const [state, dispatch] = useReducer(swipeReducer, initialState);
  const [showTutorial, setShowTutorial] = useState(false);

  /**
   * Load photos based on category
   */
  const loadPhotos = useCallback(async () => {
    try {
      dispatch({ type: 'LOAD_PHOTOS_START' });

      let photos: Photo[] = [];
      let total = 0;
      const limit = 50; // Initial batch size

      switch (category) {
        case 'all':
          photos = await PhotoQueries.getAllPhotos({ limit, offset: 0 });
          // Get total count (simplified - in production, add a separate count query)
          total = photos.length;
          break;

        case 'screenshots':
          photos = await PhotoQueries.getScreenshots({ limit, offset: 0 });
          total = photos.length;
          break;

        case 'largeFiles':
          photos = await PhotoQueries.getLargeFiles(5 * 1024 * 1024, { limit, offset: 0 });
          total = photos.length;
          break;

        case 'duplicates': {
          // Load duplicate groups and flatten to individual photos
          const groups = await DuplicateQueries.getDuplicateGroups();
          // Flatten duplicate groups to get individual photos
          // Note: DuplicateGroups need to be loaded with photos included
          photos = [];
          total = 0;
          // TODO: Implement proper duplicate photo loading
          // For now, duplicates category won't work until we add proper flattening logic
          break;
        }

        default:
          photos = [];
          total = 0;
      }

      dispatch({
        type: 'LOAD_PHOTOS_SUCCESS',
        photos,
        total,
        hasMore: photos.length >= limit,
      });
    } catch (err) {
      console.error('[SwipeMode] Error loading photos:', err);
      dispatch({
        type: 'LOAD_PHOTOS_ERROR',
        error: err instanceof Error ? err.message : 'Failed to load photos',
      });
    }
  }, [category]);

  /**
   * Load more photos (pagination)
   */
  const loadMorePhotos = useCallback(async () => {
    if (!state.hasMore || state.loading || state.photos.length - state.currentIndex > 10) {
      return; // Don't load if already loading or enough photos in buffer
    }

    try {
      const limit = 50;
      const offset = state.photos.length;
      let morePhotos: Photo[] = [];

      switch (category) {
        case 'all':
          morePhotos = await PhotoQueries.getAllPhotos({ limit, offset });
          break;

        case 'screenshots':
          morePhotos = await PhotoQueries.getScreenshots({ limit, offset });
          break;

        case 'largeFiles':
          morePhotos = await PhotoQueries.getLargeFiles(5 * 1024 * 1024, { limit, offset });
          break;

        case 'duplicates':
          // For duplicates, we already loaded all in initial load
          // In production, implement proper pagination for duplicate groups
          morePhotos = [];
          break;

        default:
          morePhotos = [];
      }

      dispatch({ type: 'LOAD_MORE_PHOTOS', photos: morePhotos });
    } catch (err) {
      console.error('[SwipeMode] Error loading more photos:', err);
    }
  }, [category, state.hasMore, state.loading, state.photos.length, state.currentIndex]);

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
  const handleSwipeLeft = useCallback((photoId: string) => {
    dispatch({ type: 'SWIPE_LEFT', photoId });

    // Load more photos if approaching end
    if (state.photos.length - state.currentIndex <= 10) {
      loadMorePhotos();
    }
  }, [state.photos.length, state.currentIndex, loadMorePhotos]);

  /**
   * Handle swipe right (keep)
   */
  const handleSwipeRight = useCallback((photoId: string) => {
    dispatch({ type: 'SWIPE_RIGHT', photoId });

    // Load more photos if approaching end
    if (state.photos.length - state.currentIndex <= 10) {
      loadMorePhotos();
    }
  }, [state.photos.length, state.currentIndex, loadMorePhotos]);

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
              const result = await photoDeletionService.deletePhotos(trashArray);

              if (!result.success) {
                console.error('[SwipeMode] Some deletions failed:', result.errors);
                // Show partial success message if some deletions failed
                if (result.deletedCount > 0) {
                  Alert.alert(
                    'Partial Success',
                    `${result.deletedCount} of ${trashCount} photos deleted. Some deletions failed.`
                  );
                }
              }

              // Record cleanup usage for successfully deleted photos
              await usageManager.recordCleanup(result.deletedCount);

              // Calculate space saved (sum file sizes)
              const deletedPhotos = state.photos.filter(p => trashArray.includes(p.id));
              const spaceSaved = deletedPhotos.reduce((sum, p) => sum + p.file_size, 0);
              const spaceSavedMB = (spaceSaved / (1024 * 1024)).toFixed(1);

              dispatch({ type: 'EMPTY_TRASH_SUCCESS' });

              // Only show success alert if deletion was fully successful
              if (result.success && result.deletedCount === trashCount) {
                Alert.alert(
                  'Success!',
                  `${trashCount} photo${trashCount > 1 ? 's' : ''} deleted. ${spaceSavedMB} MB freed.`
                );
              }

              // Remove deleted photos from state
              const updatedPhotos = state.photos.filter(p => !trashArray.includes(p.id));
              dispatch({ type: 'LOAD_PHOTOS_SUCCESS', photos: updatedPhotos, total: updatedPhotos.length, hasMore: state.hasMore });
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
  }, [state.trashQueue, state.photos, state.hasMore, navigation]);

  // Load photos on mount and when category changes
  useEffect(() => {
    loadPhotos();
    checkTutorial();
  }, [loadPhotos, checkTutorial]);

  // Reload photos when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadPhotos();
    }, [loadPhotos])
  );

  // Update header with progress
  useEffect(() => {
    navigation.setOptions({
      title: `${getCategoryName(category)} (${state.reviewedCount}/${state.totalCount})`,
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
  }, [navigation, category, state.reviewedCount, state.totalCount, state.undoStack.length, handleUndo]);

  // Get current photo and next photos for rendering
  const currentPhoto = state.photos[state.currentIndex];
  const nextPhotos = state.photos.slice(state.currentIndex + 1, state.currentIndex + 3);

  // Render loading state
  if (state.loading && state.photos.length === 0) {
    return (
      <View style={styles.container}>
        <LoadingSpinner label="Loading photos..." size="large" />
      </View>
    );
  }

  // Render error state
  if (state.error && state.photos.length === 0) {
    return (
      <View style={styles.container}>
        <ErrorState
          type="generic"
          onRetry={loadPhotos}
        />
      </View>
    );
  }

  // Render empty state
  if (state.photos.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="📷"
          title="No Photos Found"
          message={`No ${getCategoryName(category).toLowerCase()} to review.`}
          action={{
            label: "Go Back",
            onPress: () => navigation.goBack(),
          }}
        />
      </View>
    );
  }

  // Render end-of-queue state
  if (state.currentIndex >= state.photos.length) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="🎉"
          title="All Done!"
          message={`You reviewed ${state.reviewedCount} photo${state.reviewedCount > 1 ? 's' : ''}. ${state.trashQueue.size} queued for deletion.`}
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
        {[...nextPhotos].reverse().map((photo, index) => (
          <SwipeCard
            key={photo.id}
            photo={photo}
            onSwipeLeft={handleSwipeLeft}
            onSwipeRight={handleSwipeRight}
            isTopCard={false}
            zIndex={index}
          />
        ))}
        {currentPhoto && (
          <SwipeCard
            key={currentPhoto.id}
            photo={currentPhoto}
            onSwipeLeft={handleSwipeLeft}
            onSwipeRight={handleSwipeRight}
            isTopCard={true}
            zIndex={nextPhotos.length + 1}
          />
        )}
      </View>

      {/* Swipe controls (alternative tap buttons) */}
      <SwipeControls
        onTrash={() => currentPhoto && handleSwipeLeft(currentPhoto.id)}
        onKeep={() => currentPhoto && handleSwipeRight(currentPhoto.id)}
        disabled={!currentPhoto || state.isProcessing}
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
