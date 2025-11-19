import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import './global.css';

export default function App() {
  return (
    <View className="flex-1 bg-white items-center justify-center">
      <Text className="text-2xl font-bold text-blue-600 mb-4">
        CleanSpace
      </Text>
      <Text className="text-base text-gray-600">
        Privacy-First iOS Storage Manager
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}
