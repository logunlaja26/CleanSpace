import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type ScreenshotsProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Screenshots'>;
};

type Screenshot = {
  id: string;
  uri: string;
  filename: string;
  size: string;
  date: string;
  selected: boolean;
};

type ScreenshotGroup = {
  period: string;
  screenshots: Screenshot[];
  totalSize: string;
  expanded: boolean;
};

// Generate mock screenshots grouped by date
const generateMockScreenshots = (): ScreenshotGroup[] => {
  return [
    {
      period: 'Today',
      totalSize: '4.2 MB',
      expanded: true,
      screenshots: [
        {
          id: 'ss-1',
          uri: 'https://picsum.photos/200/400?random=301',
          filename: 'Screenshot_20241119_143022.png',
          size: '1.2 MB',
          date: 'Today at 2:30 PM',
          selected: false,
        },
        {
          id: 'ss-2',
          uri: 'https://picsum.photos/200/400?random=302',
          filename: 'Screenshot_20241119_120445.png',
          size: '1.5 MB',
          date: 'Today at 12:04 PM',
          selected: false,
        },
        {
          id: 'ss-3',
          uri: 'https://picsum.photos/200/400?random=303',
          filename: 'Screenshot_20241119_091235.png',
          size: '1.5 MB',
          date: 'Today at 9:12 AM',
          selected: false,
        },
      ],
    },
    {
      period: 'Yesterday',
      totalSize: '6.8 MB',
      expanded: false,
      screenshots: [
        {
          id: 'ss-4',
          uri: 'https://picsum.photos/200/400?random=304',
          filename: 'Screenshot_20241118_183045.png',
          size: '1.4 MB',
          date: 'Yesterday at 6:30 PM',
          selected: false,
        },
        {
          id: 'ss-5',
          uri: 'https://picsum.photos/200/400?random=305',
          filename: 'Screenshot_20241118_152120.png',
          size: '1.8 MB',
          date: 'Yesterday at 3:21 PM',
          selected: false,
        },
        {
          id: 'ss-6',
          uri: 'https://picsum.photos/200/400?random=306',
          filename: 'Screenshot_20241118_111543.png',
          size: '1.6 MB',
          date: 'Yesterday at 11:15 AM',
          selected: false,
        },
        {
          id: 'ss-7',
          uri: 'https://picsum.photos/200/400?random=307',
          filename: 'Screenshot_20241118_094512.png',
          size: '2.0 MB',
          date: 'Yesterday at 9:45 AM',
          selected: false,
        },
      ],
    },
    {
      period: 'Last Week',
      totalSize: '18.5 MB',
      expanded: false,
      screenshots: Array.from({ length: 12 }, (_, i) => ({
        id: `ss-week-${i}`,
        uri: `https://picsum.photos/200/400?random=${310 + i}`,
        filename: `Screenshot_2024111${i}_${String(Math.floor(Math.random() * 24)).padStart(2, '0')}${String(Math.floor(Math.random() * 60)).padStart(2, '0')}${String(Math.floor(Math.random() * 60)).padStart(2, '0')}.png`,
        size: `${(Math.random() * 2 + 0.5).toFixed(1)} MB`,
        date: `Nov ${11 + Math.floor(i / 2)}`,
        selected: false,
      })),
    },
    {
      period: 'Last Month',
      totalSize: '42.3 MB',
      expanded: false,
      screenshots: Array.from({ length: 28 }, (_, i) => ({
        id: `ss-month-${i}`,
        uri: `https://picsum.photos/200/400?random=${320 + i}`,
        filename: `Screenshot_2024100${String(i % 30).padStart(2, '0')}_${String(Math.floor(Math.random() * 24)).padStart(2, '0')}${String(Math.floor(Math.random() * 60)).padStart(2, '0')}${String(Math.floor(Math.random() * 60)).padStart(2, '0')}.png`,
        size: `${(Math.random() * 2 + 0.5).toFixed(1)} MB`,
        date: `Oct ${1 + i}`,
        selected: false,
      })),
    },
    {
      period: 'Older',
      totalSize: '156.7 MB',
      expanded: false,
      screenshots: Array.from({ length: 98 }, (_, i) => ({
        id: `ss-older-${i}`,
        uri: `https://picsum.photos/200/400?random=${350 + i}`,
        filename: `Screenshot_202409${String(Math.floor(i / 10) % 3).padStart(2, '0')}_${String(Math.floor(Math.random() * 24)).padStart(2, '0')}${String(Math.floor(Math.random() * 60)).padStart(2, '0')}${String(Math.floor(Math.random() * 60)).padStart(2, '0')}.png`,
        size: `${(Math.random() * 2 + 0.5).toFixed(1)} MB`,
        date: 'Sep 2024',
        selected: false,
      })),
    },
  ];
};

export default function Screenshots({ navigation }: ScreenshotsProps) {
  const [groups, setGroups] = useState<ScreenshotGroup[]>(generateMockScreenshots());

  const toggleGroup = (period: string) => {
    setGroups(groups.map(g =>
      g.period === period ? { ...g, expanded: !g.expanded } : g
    ));
  };

  const toggleScreenshotSelection = (groupPeriod: string, screenshotId: string) => {
    setGroups(groups.map(g =>
      g.period === groupPeriod
        ? {
            ...g,
            screenshots: g.screenshots.map(s =>
              s.id === screenshotId ? { ...s, selected: !s.selected } : s
            ),
          }
        : g
    ));
  };

  const selectAllInGroup = (period: string) => {
    setGroups(groups.map(g =>
      g.period === period
        ? { ...g, screenshots: g.screenshots.map(s => ({ ...s, selected: true })) }
        : g
    ));
  };

  const deleteGroup = (period: string) => {
    // In real implementation, this would delete the screenshots
    setGroups(groups.filter(g => g.period !== period));
  };

  const totalSelectedCount = groups.reduce(
    (sum, g) => sum + g.screenshots.filter(s => s.selected).length,
    0
  );

  const totalSelectedSize = groups.reduce((sum, g) => {
    const groupSelectedSize = g.screenshots
      .filter(s => s.selected)
      .reduce((gSum, s) => gSum + parseFloat(s.size.replace(' MB', '')), 0);
    return sum + groupSelectedSize;
  }, 0);

  return (
    <View className="flex-1 bg-gray-50">
      {/* Summary Header */}
      <View className="bg-purple-600 p-4">
        <Text className="text-white text-2xl font-bold mb-1">
          {groups.reduce((sum, g) => sum + g.screenshots.length, 0)} Screenshots
        </Text>
        <Text className="text-purple-100">
          Taking up {groups.reduce((sum, g) => sum + parseFloat(g.totalSize.replace(' MB', '')), 0).toFixed(1)} MB
        </Text>
      </View>

      <ScrollView className="flex-1">
        {groups.map((group) => (
          <View key={group.period} className="bg-white m-3 rounded-xl shadow-sm overflow-hidden">
            {/* Group Header */}
            <View className="bg-gray-50 p-4">
              <TouchableOpacity
                onPress={() => toggleGroup(group.period)}
                className="flex-row justify-between items-center mb-3"
              >
                <View>
                  <Text className="font-bold text-gray-800 text-lg mb-1">
                    {group.period}
                  </Text>
                  <Text className="text-sm text-gray-600">
                    {group.screenshots.length} screenshots • {group.totalSize}
                  </Text>
                </View>
                <Text className="text-gray-400 text-xl">
                  {group.expanded ? '▼' : '▶'}
                </Text>
              </TouchableOpacity>

              {/* Quick Actions */}
              <View className="flex-row space-x-2">
                <TouchableOpacity
                  onPress={() => selectAllInGroup(group.period)}
                  className="flex-1 bg-blue-100 py-2 rounded-lg"
                >
                  <Text className="text-blue-700 text-center font-semibold text-sm">
                    Select All
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => deleteGroup(group.period)}
                  className="flex-1 bg-red-100 py-2 rounded-lg"
                >
                  <Text className="text-red-700 text-center font-semibold text-sm">
                    Delete Group
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Expanded Screenshot Grid */}
            {group.expanded && (
              <View className="p-3">
                <View className="flex-row flex-wrap">
                  {group.screenshots.map((screenshot) => (
                    <TouchableOpacity
                      key={screenshot.id}
                      onPress={() => toggleScreenshotSelection(group.period, screenshot.id)}
                      className="w-1/3 p-1"
                    >
                      <View className="relative">
                        <Image
                          source={{ uri: screenshot.uri }}
                          className="w-full aspect-[9/16] rounded-lg"
                          resizeMode="cover"
                        />
                        {screenshot.selected && (
                          <View className="absolute inset-0 bg-blue-600/40 rounded-lg items-center justify-center">
                            <View className="bg-blue-600 rounded-full w-10 h-10 items-center justify-center">
                              <Text className="text-white font-bold text-xl">✓</Text>
                            </View>
                          </View>
                        )}
                        <View className="absolute bottom-1 right-1 bg-black/70 px-2 py-0.5 rounded">
                          <Text className="text-white text-xs">{screenshot.size}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Delete Selected Action Bar */}
      {totalSelectedCount > 0 && (
        <View className="bg-white border-t border-gray-200 p-4">
          <View className="mb-2">
            <Text className="text-gray-600 text-sm">
              {totalSelectedCount} screenshot{totalSelectedCount > 1 ? 's' : ''} selected
            </Text>
            <Text className="font-bold text-gray-800 text-lg">
              {totalSelectedSize.toFixed(1)} MB to recover
            </Text>
          </View>
          <TouchableOpacity className="bg-red-600 py-4 rounded-xl">
            <Text className="text-white text-center font-bold text-lg">
              Delete Selected ({totalSelectedCount})
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
