import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type LargeFilesProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'LargeFiles'>;
};

type LargeFile = {
  id: string;
  uri: string;
  filename: string;
  size: number; // in MB
  type: 'photo' | 'video';
  date: string;
  compressible: boolean;
  estimatedCompressedSize?: number;
  selected: boolean;
};

// Generate mock large files
const generateMockLargeFiles = (): LargeFile[] => {
  return [
    {
      id: 'large-1',
      uri: 'https://picsum.photos/300/200?random=201',
      filename: 'IMG_5432.jpg',
      size: 28.5,
      type: 'photo',
      date: '2024-11-15',
      compressible: true,
      estimatedCompressedSize: 8.2,
      selected: false,
    },
    {
      id: 'large-2',
      uri: 'https://picsum.photos/300/200?random=202',
      filename: 'VID_1234.mp4',
      size: 156.8,
      type: 'video',
      date: '2024-11-10',
      compressible: true,
      estimatedCompressedSize: 62.3,
      selected: false,
    },
    {
      id: 'large-3',
      uri: 'https://picsum.photos/300/200?random=203',
      filename: 'IMG_9876.HEIC',
      size: 12.3,
      type: 'photo',
      date: '2024-11-08',
      compressible: false,
      selected: false,
    },
    {
      id: 'large-4',
      uri: 'https://picsum.photos/300/200?random=204',
      filename: 'IMG_4567.jpg',
      size: 45.2,
      type: 'photo',
      date: '2024-11-05',
      compressible: true,
      estimatedCompressedSize: 12.8,
      selected: false,
    },
    {
      id: 'large-5',
      uri: 'https://picsum.photos/300/200?random=205',
      filename: 'VID_5678.mov',
      size: 89.4,
      type: 'video',
      date: '2024-11-02',
      compressible: true,
      estimatedCompressedSize: 35.6,
      selected: false,
    },
    {
      id: 'large-6',
      uri: 'https://picsum.photos/300/200?random=206',
      filename: 'IMG_3210.jpg',
      size: 8.7,
      type: 'photo',
      date: '2024-10-28',
      compressible: true,
      estimatedCompressedSize: 3.2,
      selected: false,
    },
  ];
};

const getSizeColor = (size: number): string => {
  if (size > 50) return 'text-red-600';
  if (size > 20) return 'text-orange-600';
  if (size > 10) return 'text-yellow-600';
  return 'text-gray-700';
};

const getSizeBadgeColor = (size: number): string => {
  if (size > 50) return 'bg-red-100';
  if (size > 20) return 'bg-orange-100';
  if (size > 10) return 'bg-yellow-100';
  return 'bg-gray-100';
};

export default function LargeFiles({ navigation }: LargeFilesProps) {
  const [files, setFiles] = useState<LargeFile[]>(generateMockLargeFiles());
  const [filterType, setFilterType] = useState<'all' | 'photo' | 'video'>('all');

  const filteredFiles = files.filter(f =>
    filterType === 'all' ? true : f.type === filterType
  );

  const toggleSelection = (id: string) => {
    setFiles(files.map(f =>
      f.id === id ? { ...f, selected: !f.selected } : f
    ));
  };

  const selectedFiles = files.filter(f => f.selected);
  const totalSelectedSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
  const totalCompressibleSavings = selectedFiles.reduce((sum, f) =>
    f.compressible && f.estimatedCompressedSize
      ? sum + (f.size - f.estimatedCompressedSize)
      : sum,
    0
  );

  return (
    <View className="flex-1 bg-gray-50">
      {/* Filter Bar */}
      <View className="bg-white p-3 border-b border-gray-200">
        <View className="flex-row space-x-2">
          <TouchableOpacity
            onPress={() => setFilterType('all')}
            className={`flex-1 py-2 rounded-lg ${filterType === 'all' ? 'bg-blue-600' : 'bg-gray-200'}`}
          >
            <Text className={`text-center font-semibold ${filterType === 'all' ? 'text-white' : 'text-gray-700'}`}>
              All ({files.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFilterType('photo')}
            className={`flex-1 py-2 rounded-lg ${filterType === 'photo' ? 'bg-blue-600' : 'bg-gray-200'}`}
          >
            <Text className={`text-center font-semibold ${filterType === 'photo' ? 'text-white' : 'text-gray-700'}`}>
              Photos ({files.filter(f => f.type === 'photo').length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFilterType('video')}
            className={`flex-1 py-2 rounded-lg ${filterType === 'video' ? 'bg-blue-600' : 'bg-gray-200'}`}
          >
            <Text className={`text-center font-semibold ${filterType === 'video' ? 'text-white' : 'text-gray-700'}`}>
              Videos ({files.filter(f => f.type === 'video').length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1">
        {filteredFiles.map((file) => (
          <TouchableOpacity
            key={file.id}
            onPress={() => toggleSelection(file.id)}
            className="bg-white m-3 p-4 rounded-xl shadow-sm flex-row"
          >
            {/* Thumbnail */}
            <View className="relative">
              <Image
                source={{ uri: file.uri }}
                className="w-20 h-20 rounded-lg"
                resizeMode="cover"
              />
              {file.type === 'video' && (
                <View className="absolute inset-0 items-center justify-center">
                  <View className="bg-black/60 rounded-full w-8 h-8 items-center justify-center">
                    <Text className="text-white font-bold">▶</Text>
                  </View>
                </View>
              )}
              {file.selected && (
                <View className="absolute top-1 right-1 bg-blue-600 rounded-full w-6 h-6 items-center justify-center">
                  <Text className="text-white text-xs font-bold">✓</Text>
                </View>
              )}
            </View>

            {/* File Info */}
            <View className="flex-1 ml-3">
              <Text className="font-semibold text-gray-800 mb-1">{file.filename}</Text>
              <Text className="text-sm text-gray-500 mb-2">{file.date}</Text>

              {/* Size Badge */}
              <View className="flex-row items-center">
                <View className={`${getSizeBadgeColor(file.size)} px-3 py-1 rounded-full`}>
                  <Text className={`${getSizeColor(file.size)} font-bold`}>
                    {file.size.toFixed(1)} MB
                  </Text>
                </View>

                {/* Compression Info */}
                {file.compressible && file.estimatedCompressedSize && (
                  <View className="ml-2 bg-green-100 px-3 py-1 rounded-full flex-row items-center">
                    <Text className="text-green-700 text-sm font-semibold">
                      → {file.estimatedCompressedSize.toFixed(1)} MB
                    </Text>
                    <View className="ml-1 bg-blue-600 px-1.5 py-0.5 rounded">
                      <Text className="text-white text-xs font-bold">PRO</Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Compression Savings */}
              {file.compressible && file.estimatedCompressedSize && (
                <Text className="text-xs text-green-600 mt-1">
                  Save {(file.size - file.estimatedCompressedSize).toFixed(1)} MB with compression
                </Text>
              )}
            </View>
          </TouchableOpacity>
        ))}

        {filteredFiles.length === 0 && (
          <View className="items-center justify-center p-10">
            <Text className="text-gray-400 text-lg">No large files found</Text>
          </View>
        )}
      </ScrollView>

      {/* Action Bar */}
      {selectedFiles.length > 0 && (
        <View className="bg-white border-t border-gray-200 p-4">
          <View className="mb-3">
            <Text className="text-gray-600 text-sm">
              {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
            </Text>
            <Text className="font-bold text-gray-800 text-lg">
              {totalSelectedSize.toFixed(1)} MB total
            </Text>
            {totalCompressibleSavings > 0 && (
              <Text className="text-green-600 text-sm">
                Save {totalCompressibleSavings.toFixed(1)} MB with compression (Pro)
              </Text>
            )}
          </View>

          <View className="flex-row space-x-2">
            {totalCompressibleSavings > 0 && (
              <TouchableOpacity
                className="flex-1 bg-green-600 py-3 rounded-lg"
                onPress={() => navigation.navigate('Paywall')}
              >
                <Text className="text-white text-center font-bold">
                  Compress
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity className="flex-1 bg-red-600 py-3 rounded-lg">
              <Text className="text-white text-center font-bold">
                Delete
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
