import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Platform, ScrollView, ActivityIndicator } from 'react-native';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '@/constants/Config';
import { useAlert } from '@/context/AlertContext';

export default function DashboardScreen() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [stats, setStats] = useState<any>(null);
    const [profile, setProfile] = useState<any>(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [fetchingData, setFetchingData] = useState(false);

    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { showAlert } = useAlert();

    useFocusEffect(
        React.useCallback(() => {
            checkLoginStatus();
        }, [])
    );

    const checkLoginStatus = async () => {
        try {
            const token = Platform.OS === 'web'
                ? localStorage.getItem('userToken')
                : await SecureStore.getItemAsync('userToken');

            if (token) {
                setIsLoggedIn(true);
                reloadData(token);
            } else {
                router.replace('/login');
            }
        } catch (e) {
            console.log("Token kontrol hatası");
            router.replace('/login');
        } finally {
            setLoading(false);
        }
    };

    const reloadData = async (token: string) => {
        setFetchingData(true);
        try {
            const [statsRes, profileRes, notifsRes] = await Promise.all([
                axios.get(`${API_URL}/Subscribers/stats`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`${API_URL}/Auth/profile`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`${API_URL}/System/notifications`, { headers: { Authorization: `Bearer ${token}` } })
            ]);
            setStats(statsRes.data);
            setProfile(profileRes.data);

            const unread = notifsRes.data.filter((n: any) => !n.isRead).length;
            setUnreadCount(unread);
        } catch (error: any) {
            if (error.response?.status === 401) handleLogout();
        } finally {
            setFetchingData(false);
        }
    };

    const handleLogout = () => {
        showAlert({
            title: "Güvenli Çıkış",
            message: "Hesabınızdan güvenli bir şekilde çıkmak istiyor musunuz?",
            type: 'confirm',
            showCancel: true,
            confirmText: "Çıkış Yap",
            cancelText: "Vazgeç",
            onConfirm: async () => {
                try {
                    let token = null;
                    if (Platform.OS === 'web') {
                        token = localStorage.getItem('userToken');
                    } else {
                        token = await SecureStore.getItemAsync('userToken');
                    }

                    if (token) {
                        const platform = Platform.OS === 'web' ? 'Web Sitesi' : 'Mobil Uygulama';
                        await axios.post(`${API_URL}/Auth/logout`, { platform }, {
                            headers: { Authorization: `Bearer ${token}` }
                        });
                    }
                } catch (error) {
                    console.log("Logout API error:", error);
                }

                if (Platform.OS === 'web') {
                    localStorage.removeItem('userToken');
                    localStorage.removeItem('userData');
                } else {
                    await SecureStore.deleteItemAsync('userToken');
                    await SecureStore.deleteItemAsync('userData');
                }

                setIsLoggedIn(false);
                setStats(null);
                router.replace('/login');
            }
        });
    };

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#6366f1" /></View>;

    if (!isLoggedIn) return null;

    return (
        <ScrollView style={[styles.container, { paddingTop: insets.top }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.dashboardHeader}>
                <View>
                    <Text style={styles.welcomeText}>Merhaba, {profile?.firstName || 'Kullanıcı'} ✨</Text>
                    <Text style={styles.brandTitle}>{profile?.displayName || 'MailMarketingMobile'}</Text>
                </View>
                <View style={styles.headerActions}>
                    <TouchableOpacity onPress={() => router.push('/notifications' as any)}>
                        <View style={styles.avatarHeader}>
                            <Ionicons name="notifications-outline" size={20} color="#6366f1" />
                            {unreadCount > 0 && (
                                <View style={styles.badge}>
                                    <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                                </View>
                            )}
                        </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => router.push('/profile' as any)}>
                        <View style={styles.avatarHeader}>
                            <Ionicons name="person" size={20} color="#6366f1" />
                        </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
                        <View style={[styles.avatarHeader, { borderColor: '#fee2e2' }]}>
                            <Ionicons name="log-out-outline" size={20} color="#ef4444" />
                        </View>
                    </TouchableOpacity>
                </View>
            </View>

            {fetchingData && !stats ? <ActivityIndicator color="#6366f1" style={{ marginTop: 50 }} /> : (
                <View style={styles.content}>
                    <View style={styles.highlightsRow}>
                        <View style={[styles.highlightBox, { backgroundColor: '#6366f1' }]}>
                            <Text style={styles.highlightVal}>{stats?.activeSubscribers || 0}</Text>
                            <Text style={styles.highlightLabel}>Aktif Abone</Text>
                            <Ionicons name="people" size={24} color="rgba(255,255,255,0.3)" style={styles.highlightIcon} />
                        </View>
                        <View style={[styles.highlightBox, { backgroundColor: '#10b981' }]}>
                            <Text style={styles.highlightVal}>{stats?.totalSent || 0}</Text>
                            <Text style={styles.highlightLabel}>Gönderilen Mail</Text>
                            <Ionicons name="paper-plane" size={24} color="rgba(255,255,255,0.3)" style={styles.highlightIcon} />
                        </View>
                    </View>

                    <View style={styles.chartCard}>
                        <View style={styles.chartHeader}>
                            <Text style={styles.cardTitle}>Haftalık Analiz</Text>
                            <View style={styles.successBadge}>
                                <Text style={styles.successBadgeText}>🔥 En İyi Gün: {stats?.weeklyAnalysis?.reduce((prev: any, current: any) => (prev.count > current.count) ? prev : current).day}</Text>
                            </View>
                        </View>
                        <View style={styles.chartContainer}>
                            {stats?.weeklyAnalysis?.map((item: any, index: number) => (
                                <View key={index} style={styles.barItem}>
                                    <View style={styles.barTrack}>
                                        <View style={[styles.barFill, { height: Math.min((item.count / (Math.max(...stats.weeklyAnalysis.map((a: any) => a.count)) || 1)) * 100, 100) || 5 }]} />
                                    </View>
                                    <Text style={styles.barDay}>{item.day}</Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    <View style={styles.menuGrid}>
                        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/templates' as any)}>
                            <View style={[styles.menuIcon, { backgroundColor: '#fff3e0' }]}><Ionicons name="copy" size={22} color="#ffc107" /></View>
                            <Text style={styles.menuLabel}>Şablonlar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/subscribers' as any)}>
                            <View style={[styles.menuIcon, { backgroundColor: '#e7f0ff' }]}><Ionicons name="people" size={22} color="#0d6efd" /></View>
                            <Text style={styles.menuLabel}>Aboneler</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/folders' as any)}>
                            <View style={[styles.menuIcon, { backgroundColor: '#e8f5e9' }]}><Ionicons name="folder" size={22} color="#198754" /></View>
                            <Text style={styles.menuLabel}>Klasörler</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/reports' as any)}>
                            <View style={[styles.menuIcon, { backgroundColor: '#fce4e4' }]}><Ionicons name="bar-chart" size={22} color="#dc3545" /></View>
                            <Text style={styles.menuLabel}>Raporlar</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.recentSection}>
                        <Text style={styles.cardTitle}>Son Gönderimler</Text>
                        <View style={styles.activityList}>
                            {stats?.recentActivities?.map((act: any) => (
                                <View key={act.id} style={styles.activityItem}>
                                    <View style={[styles.dot, { backgroundColor: act.isSuccess ? '#10b981' : '#ef4444' }]} />
                                    <Text style={styles.actSubject} numberOfLines={1}>{act.subject}</Text>
                                    <Text style={styles.actDate}>{new Date(act.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    <TouchableOpacity style={styles.fab} onPress={() => router.push('/campaign/new')}>
                        <Ionicons name="send" size={28} color="#fff" />
                    </TouchableOpacity>
                </View>
            )}
            <View style={{ height: 100 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f1f5f9' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    dashboardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 25, backgroundColor: '#fff' },
    welcomeText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
    brandTitle: { fontSize: 20, fontWeight: '800', color: '#333', marginTop: 2 },
    avatarHeader: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', position: 'relative' },
    badge: { position: 'absolute', top: -5, right: -5, backgroundColor: '#ef4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#fff' },
    badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
    headerActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    logoutBtn: { marginLeft: 0 },
    content: { padding: 20 },
    highlightsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    highlightBox: { flex: 1, padding: 20, borderRadius: 24, position: 'relative', overflow: 'hidden', elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
    highlightVal: { fontSize: 24, fontWeight: '800', color: '#fff' },
    highlightLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginTop: 4 },
    highlightIcon: { position: 'absolute', right: -5, bottom: -5 },
    chartCard: { backgroundColor: '#fff', borderRadius: 30, padding: 25, marginBottom: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05 },
    chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
    cardTitle: { fontSize: 16, fontWeight: '800', color: '#333' },
    successBadge: { backgroundColor: '#f0fdf4', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
    successBadgeText: { fontSize: 10, color: '#16a34a', fontWeight: 'bold' },
    chartContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 120 },
    barItem: { alignItems: 'center', flex: 1 },
    barTrack: { width: 12, height: 100, backgroundColor: '#f1f5f9', borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
    barFill: { width: '100%', backgroundColor: '#6366f1', borderRadius: 6 },
    barDay: { fontSize: 10, color: '#94a3b8', marginTop: 10, fontWeight: '700' },
    menuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
    menuItem: { width: '48%', backgroundColor: '#fff', padding: 20, borderRadius: 24, alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.03 },
    menuIcon: { width: 50, height: 50, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    menuLabel: { fontSize: 13, fontWeight: '700', color: '#475569' },
    recentSection: { backgroundColor: '#fff', borderRadius: 30, padding: 25, elevation: 2 },
    activityList: { marginTop: 15 },
    activityItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    dot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
    actSubject: { flex: 1, fontSize: 14, fontWeight: '600', color: '#333' },
    actDate: { fontSize: 12, color: '#94a3b8' },
    fab: { position: 'absolute', right: 20, bottom: -40, width: 65, height: 65, borderRadius: 22, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#6366f1', shadowOpacity: 0.4, shadowRadius: 10 }
});
