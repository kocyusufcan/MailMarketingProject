import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlert } from '@/context/AlertContext';
import axios from 'axios';
import { API_URL } from '@/constants/Config';

export default function ExploreMenuScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { showAlert } = useAlert();
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        const loadUser = async () => {
            try {
                const raw = Platform.OS === 'web'
                    ? localStorage.getItem('user')
                    : await SecureStore.getItemAsync('user');
                if (raw) {
                    const u = JSON.parse(raw);
                    setIsAdmin(u.isAdmin === true);
                }
            } catch { }
        };
        loadUser();
    }, []);

    const handleLogout = () => {
        showAlert({
            title: "Çıkış Yap",
            message: "Hesabınızdan güvenli bir şekilde çıkmak istiyor musunuz?",
            type: 'confirm',
            showCancel: true,
            confirmText: "Çıkış",
            cancelText: "İptal",
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
                    // Even if API call fails, proceed with local logout
                }

                if (Platform.OS === 'web') {
                    localStorage.removeItem('userToken');
                    localStorage.removeItem('userData'); // Assuming userData also needs to be cleared for web
                } else {
                    await SecureStore.deleteItemAsync('userToken');
                    await SecureStore.deleteItemAsync('userData');
                }
                router.replace('/login');
            }
        });
    };

    const navigateTo = (route: string) => {
        if (route) {
            router.push(route as any);
        }
    };

    return (
        <ScrollView style={[styles.container, { paddingTop: insets.top }]} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Menü</Text>
                <Text style={styles.headerSub}>Tüm işlemlerinize buradan ulaşabilirsiniz.</Text>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Genel</Text>
                <View style={styles.menuCard}>
                    <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('/subscribers')}>
                        <View style={[styles.iconBox, { backgroundColor: '#e7f0ff' }]}>
                            <Ionicons name="people" size={20} color="#0d6efd" />
                        </View>
                        <Text style={styles.menuText}>Aboneler</Text>
                        <Ionicons name="chevron-forward" size={20} color="#ccc" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('/folders')}>
                        <View style={[styles.iconBox, { backgroundColor: '#e8f5e9' }]}>
                            <Ionicons name="folder" size={20} color="#198754" />
                        </View>
                        <Text style={styles.menuText}>Klasörler</Text>
                        <Ionicons name="chevron-forward" size={20} color="#ccc" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('/templates')}>
                        <View style={[styles.iconBox, { backgroundColor: '#fff3e0' }]}>
                            <Ionicons name="copy" size={20} color="#ffc107" />
                        </View>
                        <Text style={styles.menuText}>Şablonlar</Text>
                        <Ionicons name="chevron-forward" size={20} color="#ccc" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('/campaign/new')}>
                        <View style={[styles.iconBox, { backgroundColor: '#e3f2fd' }]}>
                            <Ionicons name="send" size={20} color="#2196f3" />
                        </View>
                        <Text style={styles.menuText}>Yeni Gönderim</Text>
                        <Ionicons name="chevron-forward" size={20} color="#ccc" />
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={() => navigateTo('/reports')}>
                        <View style={[styles.iconBox, { backgroundColor: '#fce4e4' }]}>
                            <Ionicons name="bar-chart" size={20} color="#dc3545" />
                        </View>
                        <Text style={styles.menuText}>Raporlar</Text>
                        <Ionicons name="chevron-forward" size={20} color="#ccc" />
                    </TouchableOpacity>
                </View>
            </View>

            {isAdmin && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Yönetim</Text>
                    <View style={styles.menuCard}>
                        <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={() => navigateTo('/users')}>
                            <View style={[styles.iconBox, { backgroundColor: '#e0f7fa' }]}>
                                <Ionicons name="person-add" size={20} color="#00bcd4" />
                            </View>
                            <Text style={styles.menuText}>Kullanıcılar</Text>
                            <Ionicons name="chevron-forward" size={20} color="#ccc" />
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Hesap Yönetimi</Text>
                <View style={styles.menuCard}>
                    <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('/profile')}>
                        <View style={[styles.iconBox, { backgroundColor: '#f8f9fa' }]}>
                            <Ionicons name="person-circle" size={20} color="#6c757d" />
                        </View>
                        <Text style={styles.menuText}>Profil Bilgilerim</Text>
                        <Ionicons name="chevron-forward" size={20} color="#ccc" />
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={() => navigateTo('/settings/smtp')}>
                        <View style={[styles.iconBox, { backgroundColor: '#f8f9fa' }]}>
                            <Ionicons name="settings" size={20} color="#6c757d" />
                        </View>
                        <Text style={styles.menuText}>SMTP Ayarlarım</Text>
                        <Ionicons name="chevron-forward" size={20} color="#ccc" />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={[styles.section, { marginBottom: 40 }]}>
                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                    <Ionicons name="log-out-outline" size={22} color="#dc3545" />
                    <Text style={styles.logoutText}>Güvenli Çıkış</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    header: { padding: 25, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
    headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#212529' },
    headerSub: { fontSize: 14, color: '#6c757d', marginTop: 5 },
    section: { paddingHorizontal: 20, marginTop: 25 },
    sectionTitle: { fontSize: 13, fontWeight: 'bold', color: '#6c757d', textTransform: 'uppercase', marginBottom: 10, marginLeft: 5 },
    menuCard: { backgroundColor: '#fff', borderRadius: 15, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
    menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' },
    iconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    menuText: { flex: 1, fontSize: 16, fontWeight: '500', color: '#212529' },
    logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 18, borderRadius: 15, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
    logoutText: { marginLeft: 10, fontSize: 16, fontWeight: 'bold', color: '#dc3545' }
});
