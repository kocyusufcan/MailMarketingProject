import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator, Platform, TouchableOpacity, Modal, ScrollView, Dimensions, Alert } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { PanGestureHandler, PanGestureHandlerGestureEvent, State, GestureHandlerRootView, Swipeable, RectButton } from 'react-native-gesture-handler';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '@/constants/Config';
import { useAlert } from '@/context/AlertContext';

export default function UsersScreen() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const { showAlert } = useAlert();
    const router = useRouter();

    // Activity Modal States
    const [activityVisible, setActivityVisible] = useState(false);
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [activityLogs, setActivityLogs] = useState<any[]>([]);
    const [activityLoading, setActivityLoading] = useState(false);

    // Selection States
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedLogs, setSelectedLogs] = useState<number[]>([]);

    const { height: SCREEN_HEIGHT } = Dimensions.get('window');
    const HALF_HEIGHT = SCREEN_HEIGHT * 0.70;
    const FULL_HEIGHT = SCREEN_HEIGHT * 0.95;
    const sheetHeight = useSharedValue(HALF_HEIGHT);
    const prevTranslationY = useSharedValue(0);
    const startSheetHeight = useSharedValue(HALF_HEIGHT); // Hangi pozisyondan sürüklendiğini takip et

    const closeModal = () => {
        setActivityVisible(false);
        // Kapatıldıktan sonra state'leri sıfırla
        setTimeout(() => {
            sheetHeight.value = HALF_HEIGHT;
            setIsSelectionMode(false);
            setSelectedLogs([]);
        }, 400);
    };

    const toggleSelection = (id: number) => {
        if (!isSelectionMode) setIsSelectionMode(true);
        setSelectedLogs(prev => prev.includes(id) ? prev.filter(logId => logId !== id) : [...prev, id]);
    };

    const selectAllLogs = () => {
        if (selectedLogs.length === activityLogs.length) {
            setSelectedLogs([]);
            setIsSelectionMode(false);
        } else {
            setSelectedLogs(activityLogs.map(log => log.id));
        }
    };

    const cancelSelection = () => {
        setIsSelectionMode(false);
        setSelectedLogs([]);
    };

    const deleteSelectedLogs = async () => {
        if (selectedLogs.length === 0) return;

        showAlert({
            title: "Logları Sil",
            message: `${selectedLogs.length} adet aktivite kaydını silmek istediğinize emin misiniz?`,
            type: 'confirm',
            showCancel: true,
            confirmText: "SİL",
            cancelText: "Vazgeç",
            onConfirm: async () => {
                const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
                try {
                    const res = await axios.post(`${API_URL}/Auth/delete-activities`, { logIds: selectedLogs }, { headers: { Authorization: `Bearer ${token}` } });
                    showAlert({ title: "Başarılı", message: res.data.message, type: 'success' });
                    setActivityLogs(prev => prev.filter(log => !selectedLogs.includes(log.id)));
                    cancelSelection();
                } catch (e: any) {
                    showAlert({ title: "Hata", message: e.response?.data?.message || "Silme işlemi başarısız.", type: 'error' });
                }
            }
        });
    };

    const deleteSingleLog = (id: number) => {
        showAlert({
            title: "Kaydı Sil",
            message: "Bu aktivite kaydını silmek istediğinize emin misiniz?",
            type: 'confirm',
            showCancel: true,
            confirmText: "SİL",
            cancelText: "Vazgeç",
            onConfirm: async () => {
                const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
                try {
                    await axios.post(`${API_URL}/Auth/delete-activities`, { logIds: [id] }, { headers: { Authorization: `Bearer ${token}` } });
                    setActivityLogs(prev => prev.filter(log => log.id !== id));
                    // showAlert({ title: "Başarılı", message: "Kayıt silindi.", type: 'success' }); // Sessiz çalışması UI için daha iyi
                } catch (e: any) {
                    showAlert({ title: "Hata", message: e.response?.data?.message || "Silme başarısız.", type: 'error' });
                }
            }
        });
    };

    const renderRightActions = (id: number) => {
        if (isSelectionMode) return null; // Seçim modundaysa swipe kapalı

        return (
            <RectButton style={styles.deleteAction} onPress={() => deleteSingleLog(id)}>
                <Ionicons name="trash" size={24} color="#fff" />
                <Text style={styles.actionText}>Sil</Text>
            </RectButton>
        );
    };

    const onSheetGesture = (event: PanGestureHandlerGestureEvent) => {
        const { translationY, state } = event.nativeEvent;

        if (state === State.BEGAN) {
            prevTranslationY.value = 0;
            startSheetHeight.value = sheetHeight.value;
        } else if (state === State.ACTIVE) {
            const delta = translationY - prevTranslationY.value;
            prevTranslationY.value = translationY;
            const newHeight = sheetHeight.value - delta;

            // Android ve iOS'te yukarı doğru daha rahat çekebilmek için sınırları genişlettik
            if (newHeight >= HALF_HEIGHT * 0.3 && newHeight <= FULL_HEIGHT) {
                sheetHeight.value = newHeight;
            }
        } else if (state === State.END || state === State.CANCELLED) {
            const velocity = event.nativeEvent.velocityY;
            const wasAtFull = startSheetHeight.value > HALF_HEIGHT + 100;

            if (wasAtFull) {
                // Tam ekrandan (FULL) aşağı çekiliyorsa
                if (velocity > 400 || sheetHeight.value < FULL_HEIGHT * 0.8) {
                    sheetHeight.value = withSpring(HALF_HEIGHT, { damping: 25, stiffness: 100 });
                } else {
                    sheetHeight.value = withSpring(FULL_HEIGHT, { damping: 25, stiffness: 100 });
                }
            } else {
                // Yarım ekrandan (HALF) hareketler
                if (velocity > 500 || sheetHeight.value < HALF_HEIGHT * 0.7) {
                    runOnJS(closeModal)();
                } else if (velocity < -300 || sheetHeight.value > HALF_HEIGHT * 1.2) {
                    sheetHeight.value = withSpring(FULL_HEIGHT, { damping: 25, stiffness: 100 });
                } else {
                    sheetHeight.value = withSpring(HALF_HEIGHT, { damping: 25, stiffness: 100 });
                }
            }
        }
    };

    const animatedSheetStyle = useAnimatedStyle(() => ({
        height: sheetHeight.value,
        maxHeight: FULL_HEIGHT
    }));

    useEffect(() => {
        (async () => {
            const userStr = Platform.OS === 'web' ? localStorage.getItem('user') : await SecureStore.getItemAsync('user');
            if (userStr) setCurrentUser(JSON.parse(userStr));
        })();
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            const res = await axios.get(`${API_URL}/Auth/users`, { headers: { Authorization: `Bearer ${token}` } });
            setUsers(res.data);
        } catch (e: any) {
            const msg = e.response?.status === 403 ? "Bu sayfaya yetkiniz yok!" : "Kullanıcılar yüklenemedi.";
            showAlert({ title: "Hata", message: msg, type: 'error' });
            router.back();
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (action: string, id: number, email: string) => {
        const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
        const headers = { Authorization: `Bearer ${token}` };

        try {
            let res;
            if (action === 'toggle-admin') {
                res = await axios.post(`${API_URL}/Auth/toggle-admin/${id}`, {}, { headers });
            } else if (action === 'toggle-status') {
                res = await axios.post(`${API_URL}/Auth/toggle-status/${id}`, {}, { headers });
            } else if (action === 'delete') {
                res = await axios.delete(`${API_URL}/Auth/delete-user/${id}`, { headers });
            }

            if (res) {
                showAlert({ title: "Başarılı", message: res.data.message, type: 'success' });
                fetchUsers();
            }
        } catch (e: any) {
            showAlert({ title: "Hata", message: e.response?.data?.message || "İşlem gerçekleştirilemedi.", type: 'error' });
        }
    };

    const showActivity = async (user: any) => {
        setSelectedUser(user);
        sheetHeight.value = HALF_HEIGHT;
        setActivityVisible(true);
        setActivityLoading(true);
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            const res = await axios.get(`${API_URL}/Auth/user-activity/${user.id}`, { headers: { Authorization: `Bearer ${token}` } });
            setActivityLogs(res.data.logs);
        } catch (e: any) {
            showAlert({ title: "Hata", message: "Aktivite günlüğü yüklenemedi.", type: 'error' });
        } finally {
            setActivityLoading(false);
        }
    };

    const confirmDelete = (id: number, email: string) => {
        showAlert({
            title: "Kullanıcıyı Sil",
            message: `${email} kullanıcısını ve tüm bağlı verilerini silmek istediğinize emin misiniz?`,
            type: 'confirm',
            showCancel: true,
            confirmText: "SİL",
            cancelText: "Vazgeç",
            onConfirm: () => handleAction('delete', id, email)
        });
    };

    const renderItem = ({ item }: any) => {
        const isMe = (currentUser?.id || currentUser?.Id) === item.id;

        return (
            <View style={styles.card}>
                <View style={styles.avatar}>
                    <Ionicons name={item.isAdmin ? "shield-checkmark" : "person"} size={20} color={item.isAdmin ? "#f59e0b" : "#6366f1"} />
                </View>
                <View style={styles.info}>
                    <Text style={styles.name}>{item.firstName} {item.lastName}</Text>
                    <Text style={styles.email}>{item.email}</Text>
                    <View style={styles.metaRow}>
                        <Text style={styles.date}>{new Date(item.createdDate).toLocaleDateString('tr-TR')} katıldı</Text>
                        {item.isAdmin && <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>ADMIN</Text></View>}
                        <View style={[styles.statusDot, { backgroundColor: item.isActive ? '#10b981' : '#ef4444' }]} />
                    </View>
                </View>

                <View style={styles.actions}>
                    {isMe ? (
                        <Text style={styles.meText}>Senin Hesabın</Text>
                    ) : (
                        <>
                            <TouchableOpacity style={styles.actionBtn} onPress={() => showActivity(item)}>
                                <Ionicons name="time-outline" size={20} color="#6366f1" />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionBtn} onPress={() => router.push({ pathname: '/reports', params: { userId: item.id, userName: `${item.firstName} ${item.lastName}` } } as any)}>
                                <Ionicons name="stats-chart-outline" size={20} color="#10b981" />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionBtn} onPress={() => handleAction('toggle-admin', item.id, item.email)}>
                                <Ionicons name={item.isAdmin ? "person-outline" : "shield-outline"} size={20} color="#f59e0b" />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionBtn} onPress={() => handleAction('toggle-status', item.id, item.email)}>
                                <Ionicons name={item.isActive ? "close-circle-outline" : "checkmark-circle-outline"} size={20} color={item.isActive ? "#ef4444" : "#10b981"} />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionBtn} onPress={() => confirmDelete(item.id, item.email)}>
                                <Ionicons name="trash-outline" size={20} color="#ef4444" />
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>
        );
    };

    return (
        <GestureHandlerRootView style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#1e293b" /></TouchableOpacity>
                <Text style={styles.headerTitle}>Sistem Kullanıcıları</Text>
                <TouchableOpacity onPress={fetchUsers}><Ionicons name="refresh" size={24} color="#6366f1" /></TouchableOpacity>
            </View>

            {loading ? <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 50 }} /> : (
                <FlatList
                    data={users}
                    keyExtractor={(item: any) => item.id.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={{ padding: 15 }}
                    ListEmptyComponent={<Text style={styles.empty}>Henüz kullanıcı bulunmuyor.</Text>}
                />
            )}

            {activityVisible && (
                <View style={[StyleSheet.absoluteFill, styles.modalOverlay, { zIndex: 1000, elevation: 10 }]}>
                    {/* Şeffaf üst alan - buraya basınca kapanır */}
                    <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} activeOpacity={1} onPress={closeModal} />

                    {/* Bottom Sheet */}
                    <Animated.View style={[styles.modalContent, animatedSheetStyle]}>

                        {/* SADECE bu alan sürüklenebilir → sheet açılır/kapanır */}
                        <PanGestureHandler activeOffsetY={[-5, 5]} onGestureEvent={onSheetGesture} onHandlerStateChange={onSheetGesture}>
                            <Animated.View style={styles.dragArea}>
                                <View style={styles.dragHandle} />
                                <View style={styles.modalHeader}>
                                    {!isSelectionMode ? (
                                        <>
                                            <Text style={styles.modalTitle}>{selectedUser?.firstName} Aktivite Günlüğü</Text>
                                            <TouchableOpacity onPress={closeModal}>
                                                <Ionicons name="close" size={24} color="#1e293b" />
                                            </TouchableOpacity>
                                        </>
                                    ) : (
                                        <View style={styles.selectionHeader}>
                                            <TouchableOpacity onPress={cancelSelection}><Text style={styles.cancelText}>İptal</Text></TouchableOpacity>
                                            <Text style={styles.selectionCount}>{selectedLogs.length} Seçili</Text>
                                            <View style={styles.selectionActions}>
                                                <TouchableOpacity onPress={selectAllLogs} style={{ marginRight: 15 }}><Text style={styles.selectAllText}>{selectedLogs.length === activityLogs.length ? 'Tümünü Kaldır' : 'Tümünü Seç'}</Text></TouchableOpacity>
                                                <TouchableOpacity onPress={deleteSelectedLogs}><Text style={styles.deleteText}>Sil</Text></TouchableOpacity>
                                            </View>
                                        </View>
                                    )}
                                </View>
                            </Animated.View>
                        </PanGestureHandler>

                        {/* İÇERİK: Bu alan tamamen scroll edilebilir, gesture yok ve FlatList ile performansı korur */}
                        {activityLoading ? <ActivityIndicator color="#6366f1" style={{ padding: 20 }} /> : (
                            <FlatList
                                data={activityLogs}
                                keyExtractor={(item: any) => item.id.toString()}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={{ paddingBottom: 20 }}
                                style={styles.modalScroll}
                                nestedScrollEnabled={true}
                                keyboardShouldPersistTaps="handled"
                                renderItem={({ item: log }) => {
                                    const isSelected = selectedLogs.includes(log.id);
                                    return (
                                        <Swipeable
                                            renderRightActions={() => renderRightActions(log.id)}
                                            friction={2} leftThreshold={30} rightThreshold={40}
                                        >
                                            <TouchableOpacity
                                                onLongPress={() => toggleSelection(log.id)}
                                                onPress={() => isSelectionMode ? toggleSelection(log.id) : null}
                                                activeOpacity={0.8}
                                                style={[styles.logItem, isSelected && styles.selectedLogItem]}
                                            >
                                                {isSelectionMode && (
                                                    <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                                                        {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                                                    </View>
                                                )}
                                                <View style={{ flex: 1 }}>
                                                    <View style={styles.logHeader}>
                                                        <Text style={styles.logTitle}>{log.actionTitle}</Text>
                                                        <Text style={styles.logDate}>{new Date(log.createdAt).toLocaleString('tr-TR')}</Text>
                                                    </View>
                                                    <Text style={styles.logDetail}>{log.actionDetail}</Text>
                                                </View>
                                            </TouchableOpacity>
                                        </Swipeable>
                                    );
                                }}
                                ListEmptyComponent={(
                                    <View style={styles.emptyActivity}>
                                        <Ionicons name="document-text-outline" size={40} color="#cbd5e1" />
                                        <Text style={styles.emptyActivityText}>Henüz aktivite kaydı bulunmuyor.</Text>
                                    </View>
                                )}
                            />
                        )}
                    </Animated.View>
                </View>
            )}
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 25, paddingTop: Platform.OS === 'ios' ? 60 : 50, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    headerTitle: { fontSize: 20, fontWeight: '900', color: '#333' },
    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 20, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
    avatar: { width: 50, height: 50, borderRadius: 15, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
    info: { flex: 1, marginLeft: 15 },
    name: { fontSize: 16, fontWeight: '800', color: '#333' },
    email: { fontSize: 13, color: '#64748b', marginTop: 2 },
    metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 8 },
    date: { fontSize: 11, color: '#94a3b8' },
    adminBadge: { backgroundColor: '#fef3c7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    adminBadgeText: { color: '#b45309', fontSize: 9, fontWeight: '900' },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    actionBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#f1f5f9' },
    meText: { fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginRight: 10 },
    empty: { textAlign: 'center', marginTop: 50, color: '#94a3b8' },

    // Modal Styles
    modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'transparent', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20, paddingBottom: 30 },
    dragHandle: { width: 40, height: 5, backgroundColor: '#e2e8f0', borderRadius: 10, alignSelf: 'center', marginBottom: 16 },
    dragArea: { paddingBottom: 4 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', minHeight: 50 },
    modalTitle: { fontSize: 18, fontWeight: '800', color: '#333', flex: 1 },
    modalScroll: { flex: 1, marginTop: 15 },
    logItem: { padding: 15, backgroundColor: '#f8fafc', borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center' },
    selectedLogItem: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1 },
    logHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
    logTitle: { fontSize: 14, fontWeight: '700', color: '#333' },
    logDate: { fontSize: 11, color: '#94a3b8' },
    logDetail: { fontSize: 13, color: '#64748b', lineHeight: 18 },
    emptyActivity: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 50 },
    emptyActivityText: { color: '#94a3b8', marginTop: 10, fontSize: 14 },

    // Selection & Swipe Styles
    selectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flex: 1 },
    cancelText: { color: '#64748b', fontSize: 16, fontWeight: '600' },
    selectionCount: { fontSize: 16, fontWeight: '800', color: '#333' },
    selectionActions: { flexDirection: 'row' },
    selectAllText: { color: '#6366f1', fontSize: 15, fontWeight: '700' },
    deleteText: { color: '#ef4444', fontSize: 16, fontWeight: '800' },
    checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: '#cbd5e1', marginRight: 15, justifyContent: 'center', alignItems: 'center' },
    checkboxSelected: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
    deleteAction: { backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center', width: 80, borderRadius: 15, marginBottom: 10, marginLeft: 10 },
    actionText: { color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 4 }
});
