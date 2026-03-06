import React, { useRef, useState } from 'react';
import { View, ScrollView, Dimensions, StyleSheet, TouchableOpacity, Text, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';

// Her iki ekranı doğrudan import et
import DashboardScreen from './index';
import ExploreMenuScreen from './explore';

const { width } = Dimensions.get('window');

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [activeTab, setActiveTab] = useState(0);

  const goToTab = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setActiveTab(index);
  };

  const handleScroll = (event: any) => {
    const page = Math.round(event.nativeEvent.contentOffset.x / width);
    if (page !== activeTab) {
      setActiveTab(page);
    }
  };

  const bottomPadding = insets.bottom > 0 ? insets.bottom : (Platform.OS === 'android' ? 10 : 8);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Yatay Kaydırılabilir Sayfa Alanı */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        bounces={false}
        decelerationRate="fast"
      >
        {/* Anasayfa */}
        <View style={{ width, flex: 1 }}>
          <DashboardScreen />
        </View>

        {/* Menü */}
        <View style={{ width, flex: 1 }}>
          <ExploreMenuScreen />
        </View>
      </ScrollView>

      {/* Özel Tab Bar */}
      <View style={[styles.tabBar, { height: 60 + bottomPadding, paddingBottom: bottomPadding }]}>
        <TouchableOpacity style={styles.tabItem} onPress={() => goToTab(0)}>
          <Ionicons
            name={activeTab === 0 ? 'home' : 'home-outline'}
            size={24}
            color={activeTab === 0 ? '#0d6efd' : '#6c757d'}
          />
          <Text style={[styles.tabLabel, activeTab === 0 && styles.tabLabelActive]}>Anasayfa</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabItem} onPress={() => goToTab(1)}>
          <Ionicons
            name={activeTab === 1 ? 'grid' : 'grid-outline'}
            size={24}
            color={activeTab === 1 ? '#0d6efd' : '#6c757d'}
          />
          <Text style={[styles.tabLabel, activeTab === 1 && styles.tabLabelActive]}>Menü</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#f1f3f5',
    paddingTop: 8,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 12, fontWeight: 'bold', color: '#6c757d', marginTop: 2 },
  tabLabelActive: { color: '#0d6efd' },
});
