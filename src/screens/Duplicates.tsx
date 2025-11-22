import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type DuplicatesProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Duplicates'>;
};

type DuplicatePhoto = {
  id: string;
  uri: string;
  size: string;
  date: string;
  isRecommended: boolean;
  qualityScore?: number;
};

type DuplicateGroup = {
  groupId: number;
  type: 'exact' | 'similar' | 'burst' | 'screenshot';
  photoCount: number;
  totalSize: string;
  savings: string;
  confidence: number;
  photos: DuplicatePhoto[];
  expanded: boolean;
};

// Generate mock duplicate groups
const generateMockDuplicateGroups = (): DuplicateGroup[] => {
  return [
    {
      groupId: 1,
      type: 'exact',
      photoCount: 3,
      totalSize: '8.4 MB',
      savings: '5.6 MB',
      confidence: 1.0,
      expanded: false,
      photos: [
        {
          id: 'dup1-1',
          uri: 'https://picsum.photos/200/200?random=101',
          size: '2.8 MB',
          date: '2024-11-15',
          isRecommended: true,
        },
        {
          id: 'dup1-2',
          uri: 'https://picsum.photos/200/200?random=101',
          size: '2.8 MB',
          date: '2024-11-15',
          isRecommended: false,
        },
        {
          id: 'dup1-3',
          uri: 'https://picsum.photos/200/200?random=101',
          size: '2.8 MB',
          date: '2024-11-15',
          isRecommended: false,
        },
      ],
    },
    {
      groupId: 2,
      type: 'similar',
      photoCount: 2,
      totalSize: '6.2 MB',
      savings: '3.1 MB',
      confidence: 0.92,
      expanded: false,
      photos: [
        {
          id: 'dup2-1',
          uri: 'https://picsum.photos/200/200?random=102',
          size: '3.1 MB',
          date: '2024-11-10',
          isRecommended: true,
          qualityScore: 95,
        },
        {
          id: 'dup2-2',
          uri: 'https://picsum.photos/200/200?random=103',
          size: '3.1 MB',
          date: '2024-11-10',
          isRecommended: false,
          qualityScore: 87,
        },
      ],
    },
    {
      groupId: 3,
      type: 'burst',
      photoCount: 5,
      totalSize: '15.5 MB',
      savings: '12.4 MB',
      confidence: 0.95,
      expanded: false,
      photos: [
        {
          id: 'dup3-1',
          uri: 'https://picsum.photos/200/200?random=104',
          size: '3.1 MB',
          date: '2024-11-08',
          isRecommended: true,
        },
        {
          id: 'dup3-2',
          uri: 'https://picsum.photos/200/200?random=105',
          size: '3.1 MB',
          date: '2024-11-08',
          isRecommended: false,
        },
        {
          id: 'dup3-3',
          uri: 'https://picsum.photos/200/200?random=106',
          size: '3.1 MB',
          date: '2024-11-08',
          isRecommended: false,
        },
        {
          id: 'dup3-4',
          uri: 'https://picsum.photos/200/200?random=107',
          size: '3.1 MB',
          date: '2024-11-08',
          isRecommended: false,
        },
        {
          id: 'dup3-5',
          uri: 'https://picsum.photos/200/200?random=108',
          size: '3.1 MB',
          date: '2024-11-08',
          isRecommended: false,
        },
      ],
    },
  ];
};

const getTypeLabel = (type: DuplicateGroup['type']) => {
  switch (type) {
    case 'exact':
      return 'Exact Match';
    case 'similar':
      return 'Visually Similar';
    case 'burst':
      return 'Burst Photos';
    case 'screenshot':
      return 'Screenshot Group';
  }
};

const getTypeColor = (type: DuplicateGroup['type']) => {
  switch (type) {
    case 'exact':
      return 'bg-red-100 text-red-700';
    case 'similar':
      return 'bg-orange-100 text-orange-700';
    case 'burst':
      return 'bg-blue-100 text-blue-700';
    case 'screenshot':
      return 'bg-purple-100 text-purple-700';
  }
};

export default function Duplicates({ navigation }: DuplicatesProps) {
  const [groups, setGroups] = useState<DuplicateGroup[]>(generateMockDuplicateGroups());

  const toggleGroup = (groupId: number) => {
    setGroups(groups.map(g =>
      g.groupId === groupId ? { ...g, expanded: !g.expanded } : g
    ));
  };

  const totalSavings = groups.reduce((sum, g) => {
    const savings = parseFloat(g.savings.replace(' MB', ''));
    return sum + savings;
  }, 0);

  return (
    <View className="flex-1 bg-gray-50">
      {/* Summary Header */}
      <View className="bg-green-600 p-5">
        <Text className="text-white text-3xl font-bold mb-1">
          {totalSavings.toFixed(1)} MB
        </Text>
        <Text className="text-green-100">
          Potential savings from {groups.length} duplicate groups
        </Text>
      </View>

      <ScrollView className="flex-1">
        {groups.map((group) => (
          <View key={group.groupId} className="bg-white m-3 rounded-xl shadow-sm overflow-hidden">
            {/* Group Header */}
            <TouchableOpacity
              onPress={() => toggleGroup(group.groupId)}
              className="p-4 flex-row justify-between items-center bg-gray-50"
            >
              <View className="flex-1">
                <View className="flex-row items-center mb-2">
                  <View className={`px-2 py-1 rounded ${getTypeColor(group.type)}`}>
                    <Text className="text-xs font-semibold">{getTypeLabel(group.type)}</Text>
                  </View>
                  <View className="ml-2 bg-gray-200 px-2 py-1 rounded">
                    <Text className="text-xs text-gray-700">
                      {(group.confidence * 100).toFixed(0)}% confident
                    </Text>
                  </View>
                </View>
                <Text className="font-semibold text-gray-800 mb-1">
                  {group.photoCount} duplicate photos
                </Text>
                <Text className="text-sm text-green-600 font-semibold">
                  Save {group.savings}
                </Text>
              </View>
              <Text className="text-gray-400 text-xl">
                {group.expanded ? '▼' : '▶'}
              </Text>
            </TouchableOpacity>

            {/* Expanded Photo Grid */}
            {group.expanded && (
              <View className="p-4">
                <Text className="text-sm text-gray-600 mb-3">
                  Select photos to keep (others will be deleted):
                </Text>
                <View className="flex-row flex-wrap">
                  {group.photos.map((photo) => (
                    <View key={photo.id} className="w-1/3 p-1">
                      <View className="relative">
                        <Image
                          source={{ uri: photo.uri }}
                          className="w-full aspect-square rounded-lg"
                          resizeMode="cover"
                        />
                        {photo.isRecommended && (
                          <View className="absolute top-1 left-1 bg-green-600 rounded px-2 py-1">
                            <Text className="text-white text-xs font-bold">Recommended</Text>
                          </View>
                        )}
                        <View className="absolute bottom-1 right-1 bg-black/70 px-2 py-0.5 rounded">
                          <Text className="text-white text-xs">{photo.size}</Text>
                        </View>
                        {photo.qualityScore && (
                          <View className="absolute bottom-1 left-1 bg-blue-600 rounded px-2 py-0.5">
                            <Text className="text-white text-xs">Q: {photo.qualityScore}</Text>
                          </View>
                        )}
                      </View>
                      <Text className="text-xs text-gray-500 mt-1 text-center">
                        {photo.date}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Action Buttons */}
                <View className="flex-row mt-4 space-x-2">
                  <TouchableOpacity className="flex-1 bg-green-600 py-3 rounded-lg">
                    <Text className="text-white text-center font-semibold">
                      Keep Recommended
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="flex-1 bg-gray-200 py-3 rounded-lg">
                    <Text className="text-gray-700 text-center font-semibold">
                      Select Manually
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ))}

        {/* Empty State */}
        {groups.length === 0 && (
          <View className="items-center justify-center p-10">
            <Text className="text-gray-400 text-lg mb-2">No duplicates found</Text>
            <Text className="text-gray-400 text-center">
              Run a scan to detect duplicate photos
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom Action Bar */}
      <View className="bg-white border-t border-gray-200 p-4">
        <TouchableOpacity className="bg-red-600 py-4 rounded-xl">
          <Text className="text-white text-center font-bold text-lg">
            Clean All Duplicates ({totalSavings.toFixed(1)} MB)
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}