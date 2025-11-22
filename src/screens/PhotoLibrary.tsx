import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type PhotoLibraryProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PhotoLibrary'>;
};

// Mock photo data
type MockPhoto = {
  id: string;
  uri: string;
  filename: string;
  size: string;
  date: string;
  selected: boolean;
};

// Generate mock photos with placeholder images
const generateMockPhotos = (): MockPhoto[] => {
  const photos: MockPhoto[] = [];
  for (let i = 1; i <= 100; i++) {
    photos.push({
      id: `photo-${i}`,
      uri: `https://picsum.photos/200/200?random=${i}`, // Random placeholder images
      filename: `IMG_${String(i).padStart(4, '0')}.jpg`,
      size: `${(Math.random() * 8 + 1).toFixed(1)} MB`,
      date: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toLocaleDateString(),
      selected: false,
    });
  }
  return photos;
};

export default function PhotoLibrary({ navigation }: PhotoLibraryProps) {
  const [photos, setPhotos] = useState<MockPhoto[]>(generateMockPhotos());
  const [selectionMode, setSelectionMode] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'size' | 'name'>('date');

  const selectedCount = photos.filter(p => p.selected).length;

  const toggleSelection = (id: string) => {
    setPhotos(photos.map(p =>
      p.id === id ? { ...p, selected: !p.selected } : p
    ));
  };

  const selectAll = () => {
    setPhotos(photos.map(p => ({ ...p, selected: true })));
  };

  const deselectAll = () => {
    setPhotos(photos.map(p => ({ ...p, selected: false })));
    setSelectionMode(false);
  };

  const renderPhoto = ({ item }: { item: MockPhoto }) => (
    <TouchableOpacity
      onPress={() => selectionMode && toggleSelection(item.id)}
      onLongPress={() => {
        setSelectionMode(true);
        toggleSelection(item.id);
      }}
      className="p-1"
      style={{ width: '33.33%' }}
    >
      <View className="relative">
        <Image
          source={{ uri: item.uri }}
          className="w-full aspect-square rounded-lg"
          resizeMode="cover"
        />
        {item.selected && (
          <View className="absolute top-2 right-2 bg-blue-600 rounded-full w-6 h-6 items-center justify-center">
            <Text className="text-white font-bold">✓</Text>
          </View>
        )}
        <View className="absolute bottom-1 right-1 bg-black/60 px-2 py-0.5 rounded">
          <Text className="text-white text-xs">{item.size}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-white">
      {/* Filter and Sort Bar */}
      <View className="bg-gray-100 p-3 border-b border-gray-200">
        <View className="flex-row justify-between items-center">
          <Text className="text-sm text-gray-600">
            {photos.length} photos
          </Text>
          <View className="flex-row space-x-2">
            <TouchableOpacity
              className={`px-3 py-1 rounded-full ${sortBy === 'date' ? 'bg-blue-600' : 'bg-gray-300'}`}
              onPress={() => setSortBy('date')}
            >
              <Text className={sortBy === 'date' ? 'text-white text-xs' : 'text-gray-700 text-xs'}>
                Date
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`px-3 py-1 rounded-full ${sortBy === 'size' ? 'bg-blue-600' : 'bg-gray-300'}`}
              onPress={() => setSortBy('size')}
            >
              <Text className={sortBy === 'size' ? 'text-white text-xs' : 'text-gray-700 text-xs'}>
                Size
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`px-3 py-1 rounded-full ${sortBy === 'name' ? 'bg-blue-600' : 'bg-gray-300'}`}
              onPress={() => setSortBy('name')}
            >
              <Text className={sortBy === 'name' ? 'text-white text-xs' : 'text-gray-700 text-xs'}>
                Name
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Photo Grid using FlashList for performance */}
      <FlashList
        data={photos}
        renderItem={renderPhoto}
        numColumns={3}
        keyExtractor={(item) => item.id}
      />

      {/* Selection Action Bar */}
      {selectionMode && (
        <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 flex-row justify-between items-center">
          <View>
            <Text className="font-semibold text-gray-800">
              {selectedCount} selected
            </Text>
          </View>
          <View className="flex-row space-x-2">
            {selectedCount < photos.length && (
              <TouchableOpacity
                onPress={selectAll}
                className="bg-blue-100 px-4 py-2 rounded-lg"
              >
                <Text className="text-blue-600 font-semibold">Select All</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={deselectAll}
              className="bg-gray-200 px-4 py-2 rounded-lg"
            >
              <Text className="text-gray-700 font-semibold">Cancel</Text>
            </TouchableOpacity>
            {selectedCount > 0 && (
              <TouchableOpacity className="bg-red-600 px-4 py-2 rounded-lg">
                <Text className="text-white font-semibold">Delete ({selectedCount})</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Bulk Selection Toggle */}
      {!selectionMode && (
        <TouchableOpacity
          onPress={() => setSelectionMode(true)}
          className="absolute bottom-6 right-6 bg-blue-600 rounded-full px-6 py-3 shadow-lg"
        >
          <Text className="text-white font-semibold">Select</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
