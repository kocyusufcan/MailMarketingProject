import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, ActivityIndicator, Platform, Modal, TextInput, KeyboardAvoidingView, BackHandler } from 'react-native';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '@/constants/Config';
import { useAlert } from '@/context/AlertContext';
import { Swipeable } from 'react-native-gesture-handler';

export default function FolderDetailScreen() {
    const { id, isSystem } = useLocalSearchParams();
    const isSystemFolder = isSystem === 'true';
    const router = useRouter();
    const { showAlert } = useAlert();
    const swipeableRefs = useRef<{ [key: number]: Swipeable | null }>({});
    const [subscribers, setSubscribers] = useState([]);
    const [filteredSubscribers, setFilteredSubscribers] = useState([]);
    const [mainSearch, setMainSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All'); // All, Active, Passive
    const [folder, setFolder] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);

    const [modalVisible, setModalVisible] = useState(false);
    const [isAddMode, setIsAddMode] = useState(true);
    const [modalData, setModalData] = useState([]);
    const [filteredModalData, setFilteredModalData] = useState([]);
    const [modalSelectedIds, setModalSelectedIds] = useState<number[]>([]);
    const [search, setSearch] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [modalLoading, setModalLoading] = useState(false);

    const handleLogout = async () => {
        if (Platform.OS === 'web') localStorage.removeItem('userToken');
        else await SecureStore.deleteItemAsync('userToken');
        router.replace('/');
    };

    useFocusEffect(
        React.useCallback(() => {
            fetchSubscribers();
            fetchFolderDetails();

            const onBackPress = () => {
                if (selectionMode) {
                    cancelSelection();
                    return true;
                }
                return false;
            };

            const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
            return () => {
                if (subscription && typeof subscription.remove === 'function') {
                    subscription.remove();
                } else if (BackHandler && typeof (BackHandler as any).removeEventListener === 'function') {
                    (BackHandler as any).removeEventListener('hardwareBackPress', onBackPress);
                }
            };
        }, [id, selectionMode, mainSearch, statusFilter])
    );

    const fetchFolderDetails = async () => {
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            const response = await axios.get(`${API_URL}/Subscribers/folders/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setFolder(response.data);
        } catch (error) {
            console.error("Klasör detayları alınamadı:", error);
        }
    };

    const fetchSubscribers = async () => {
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            const response = await axios.get(`${API_URL}/Subscribers/group/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSubscribers(response.data);
            applyMainSearch(mainSearch, statusFilter, response.data);
        } catch (error: any) {
            if (error.response?.status === 401) {
                showAlert({ title: "Oturum Kapandı", message: "Lütfen tekrar giriş yapın.", type: 'error', onConfirm: handleLogout });
            }
        } finally {
            setLoading(false);
        }
    };

    const applyMainSearch = (text: string, status = statusFilter, data = subscribers) => {
        const sourceData = Array.isArray(data) ? data : [];
        let filtered = sourceData;

        if (text) {
            filtered = filtered.filter((s: any) =>
                ((s.firstName || "") + " " + (s.lastName || "")).toLowerCase().includes(text.toLowerCase()) ||
                (s.email || "").toLowerCase().includes(text.toLowerCase())
            );
        }

        if (status !== 'All') {
            const isActive = status === 'Active';
            filtered = filtered.filter((s: any) => s.isActive === isActive);
        }

        setFilteredSubscribers(filtered);
    };

    const handleMainSearch = (text: string) => {
        setMainSearch(text);
        applyMainSearch(text, statusFilter);
    };

    const handleStatusFilter = (status: string) => {
        setStatusFilter(status);
        applyMainSearch(mainSearch, status);
    };

    const cancelSelection = () => {
        setSelectionMode(false);
        setSelectedIds([]);
    };

    const toggleSelect = (subId: number) => {
        if (selectedIds.includes(subId)) {
            const newSelection = selectedIds.filter(sid => sid !== subId);
            setSelectedIds(newSelection);
            if (newSelection.length === 0) setSelectionMode(false);
        } else {
            setSelectedIds([...selectedIds, subId]);
        }
    };

    const toggleSelectAll = () => {
        const filteredIds = filteredSubscribers.map((s: any) => s.id);
        const allSelected = filteredIds.every(id => selectedIds.includes(id));

        if (allSelected) {
            const newSelection = selectedIds.filter(id => !filteredIds.includes(id));
            setSelectedIds(newSelection);
            if (newSelection.length === 0) setSelectionMode(false);
        } else {
            const newSelection = Array.from(new Set([...selectedIds, ...filteredIds]));
            setSelectedIds(newSelection);
        }
    };

    const handleLongPress = (subId: number) => {
        if (isSystemFolder || folder?.isSystem) return;
        if (!selectionMode) {
            setSelectionMode(true);
            setSelectedIds([subId]);
        }
    };

    const handleBulkRemove = async () => {
        if (selectedIds.length === 0) return;

        showAlert({
            title: "Toplu Çıkar",
            message: `${selectedIds.length} aboneyi bu klasörden çıkarmak istediğinize emin misiniz?`,
            type: 'confirm',
            showCancel: true,
            confirmText: "Çıkar",
            cancelText: "Vazgeç",
            onConfirm: async () => {
                setIsSubmitting(true);
                try {
                    const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
                    await axios.post(`${API_URL}/Subscribers/remove-members/${id}`, selectedIds, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    cancelSelection();
                    fetchSubscribers();
                    showAlert({ title: "İşlem Başarılı", message: `${selectedIds.length} abone klasörden çıkarıldı.`, type: 'success' });
                } catch (e: any) {
                    showAlert({ title: "Hata", message: "İşlem yapılamadı.", type: 'error' });
                } finally {
                    setIsSubmitting(false);
                }
            }
        });
    };

    const openModal = async (addMode: boolean) => {
        setIsAddMode(addMode);
        setModalSelectedIds([]);
        setSearch('');
        setModalVisible(true);

        if (addMode) {
            setModalLoading(true);
            try {
                const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
                const res = await axios.get(`${API_URL}/Subscribers/all`, { headers: { Authorization: `Bearer ${token}` } });
                const existingIds = subscribers.map((s: any) => s.id);
                const filtered = res.data.filter((s: any) => !existingIds.includes(s.id));
                setModalData(filtered);
                setFilteredModalData(filtered);
            } catch (e) {
                showAlert({ title: "Hata", message: "Aboneler listelenemedi.", type: 'error' });
            } finally {
                setModalLoading(false);
            }
        } else {
            setModalData(subscribers);
            setFilteredModalData(subscribers);
        }
    };

    const handleModalSearch = (text: string) => {
        setSearch(text);
        if (!text) {
            setFilteredModalData(modalData);
            return;
        }
        const filtered = modalData.filter((s: any) =>
            ((s.firstName || "") + " " + (s.lastName || "")).toLowerCase().includes(text.toLowerCase()) ||
            (s.email || "").toLowerCase().includes(text.toLowerCase())
        );
        setFilteredModalData(filtered);
    };

    const toggleModalSelection = (subId: number) => {
        setModalSelectedIds(prev => prev.includes(subId) ? prev.filter(sid => sid !== subId) : [...prev, subId]);
    };

    const handleModalAction = async () => {
        if (modalSelectedIds.length === 0) {
            showAlert({ title: "Uyarı", message: "Lütfen en az bir abone seçin.", type: 'info' });
            return;
        }

        setIsSubmitting(true);
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            const endpoint = isAddMode ? "add-members" : "remove-members";

            await axios.post(`${API_URL}/Subscribers/${endpoint}/${id}`, modalSelectedIds, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setModalVisible(false);
            fetchSubscribers();
            showAlert({
                title: "İşlem Başarılı",
                message: isAddMode
                    ? `${modalSelectedIds.length} abone klasöre eklendi.`
                    : `${modalSelectedIds.length} abone klasörden çıkarıldı.`,
                type: 'success'
            });
        } catch (error: any) {
            showAlert({ title: "Hata", message: "Bir sorun oluştu.", type: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSwipeRemove = async (subId: number) => {
        // Refs'i kapat
        swipeableRefs.current[subId]?.close();
        showAlert({
            title: "Klasörden Çıkar",
            message: "Bu aboneyi klasörden çıkarmak istediğinize emin misiniz?",
            type: 'confirm',
            showCancel: true,
            confirmText: "Çıkar",
            cancelText: "Vazgeç",
            onConfirm: async () => {
                try {
                    const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
                    await axios.post(`${API_URL}/Subscribers/remove-members/${id}`, [subId], {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    fetchSubscribers();
                    showAlert({ title: "İşlem Başarılı", message: "Abone klasörden çıkarıldı.", type: 'success' });
                } catch {
                    showAlert({ title: "Hata", message: "İşlem yapılamadı.", type: 'error' });
                }
            }
        });
    };

    const renderRightActions = (subId: number) => (
        <TouchableOpacity
            style={styles.swipeDeleteBtn}
            onPress={() => handleSwipeRemove(subId)}
            activeOpacity={0.8}
        >
            <Ionicons name="trash" size={22} color="#fff" />
            <Text style={styles.swipeDeleteText}>Çıkar</Text>
        </TouchableOpacity>
    );

    const renderMainItem = React.useCallback(({ item }: any) => {
        const isSelected = selectedIds.includes(item.id);
        const canSwipe = !selectionMode && !isSystemFolder && !folder?.isSystem;
        return (
            <Swipeable
                ref={(ref) => { swipeableRefs.current[item.id] = ref; }}
                enabled={canSwipe}
                renderRightActions={() => canSwipe ? renderRightActions(item.id) : null}
                rightThreshold={40}
                friction={2}
                overshootRight={false}
            >
                <TouchableOpacity
                    activeOpacity={0.7}
                    style={[styles.subscriberCard, isSelected && styles.selectedCard]}
                    onPress={() => selectionMode ? toggleSelect(item.id) : null}
                    onLongPress={() => handleLongPress(item.id)}
                >
                    <View style={[styles.iconContainer, (isSelected || selectionMode) && { backgroundColor: isSelected ? '#0d6efd' : '#e7f0ff' }]}>
                        <Ionicons
                            name={isSelected ? "checkbox" : (selectionMode ? "square-outline" : "person")}
                            size={isSelected ? 24 : 20}
                            color={isSelected ? "#fff" : (selectionMode ? "#0d6efd" : "#198754")}
                        />
                    </View>
                    <View style={styles.subscriberInfo}>
                        <Text style={styles.subscriberEmail} numberOfLines={1}>{item.email}</Text>
                        <Text style={styles.subscriberName} numberOfLines={1}>{item.firstName} {item.lastName}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: item.isActive ? '#e8f5e9' : '#fce4e4' }]}>
                        <Text style={[styles.statusText, { color: item.isActive ? '#28a745' : '#dc3545' }]}>{item.isActive ? 'Aktif' : 'Pasif'}</Text>
                    </View>
                </TouchableOpacity>
            </Swipeable>
        );
    }, [selectionMode, selectedIds, folder, isSystemFolder]);

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#0d6efd" />
                <Text style={{ marginTop: 10, color: '#6c757d' }}>Aboneler Yükleniyor...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            {/* HEADER / ACTION BAR */}
            <View style={[styles.header, selectionMode && styles.selectionHeader]}>
                {selectionMode ? (
                    <>
                        <View style={styles.leftAction}>
                            <TouchableOpacity style={styles.headerBtn} onPress={cancelSelection}>
                                <Ionicons name="close" size={28} color="#fff" />
                            </TouchableOpacity>
                            <View style={styles.selectionBadge}>
                                <Text style={styles.selectionCount}>{selectedIds.length}</Text>
                                <Text style={styles.selectionLabel}>Seçildi</Text>
                            </View>
                        </View>
                        <View style={styles.actionGroup}>
                            <TouchableOpacity onPress={toggleSelectAll} style={styles.actionIcon}>
                                <Ionicons
                                    name={filteredSubscribers.length > 0 && filteredSubscribers.every((s: any) => selectedIds.includes(s.id)) ? "checkmark-done-circle" : "checkmark-circle-outline"}
                                    size={26}
                                    color="#fff"
                                />
                            </TouchableOpacity>
                            <View style={styles.headerDivider} />
                            <TouchableOpacity onPress={handleBulkRemove} style={[styles.actionIcon, styles.deleteAction]}>
                                <Ionicons name="trash" size={24} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    </>
                ) : (
                    <>
                        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
                            <Ionicons name="arrow-back" size={24} color="#212529" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle} numberOfLines={1}>{folder?.groupName || "Klasör Detayı"}</Text>
                        <View style={{ width: 40 }} />
                    </>
                )}
            </View>

            <View style={styles.summaryBox}>
                <Text style={styles.summaryText}>Klasörde <Text style={{ fontWeight: 'bold', color: '#0d6efd' }}>{subscribers.length}</Text> abone var.</Text>
            </View>

            <View style={[styles.searchBar, { borderBottomWidth: 1, borderColor: '#eee', borderRadius: 0, marginHorizontal: 0, marginBottom: 0, height: 55 }]}>
                <Ionicons name="search" size={20} color="#adb5bd" style={{ marginRight: 10 }} />
                <TextInput placeholderTextColor="#64748b"
                    style={styles.searchInput}
                    placeholder="Abone ara..."
                    value={mainSearch}
                    onChangeText={handleMainSearch}
                />
                {mainSearch.length > 0 && (
                    <TouchableOpacity onPress={() => handleMainSearch('')}>
                        <Ionicons name="close-circle" size={20} color="#adb5bd" />
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.statusFilters}>
                {['All', 'Active', 'Passive'].map(f => (
                    <TouchableOpacity
                        key={f}
                        style={[styles.filterBtn, statusFilter === f && styles.activeFilterBtn]}
                        onPress={() => handleStatusFilter(f)}
                    >
                        <Text style={[styles.filterBtnText, statusFilter === f && styles.activeFilterBtnText]}>
                            {f === 'All' ? 'Tümü' : (f === 'Active' ? 'Aktif' : 'Pasif')}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <FlatList
                data={filteredSubscribers}
                keyExtractor={(item: any) => item.id.toString()}
                contentContainerStyle={styles.listContainer}
                renderItem={renderMainItem}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={5}
                removeClippedSubviews={Platform.OS === 'android'}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Ionicons name="people-outline" size={60} color="#dee2e6" />
                        <Text style={styles.emptyText}>Henüz abone yok.</Text>
                    </View>
                }
            />

            {!isSystemFolder && !folder?.isSystem && !selectionMode && (
                <View style={styles.fabContainer}>
                    <TouchableOpacity style={styles.fab} onPress={() => openModal(true)}>
                        <Ionicons name="add" size={30} color="#fff" />
                    </TouchableOpacity>
                </View>
            )}

            {/* MODAL (Existing logic maintained) */}
            <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { height: '80%' }]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{isAddMode ? "Ekle" : "Çıkar"}</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Ionicons name="close-circle" size={28} color="#dc3545" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.searchBar}>
                            <Ionicons name="search" size={20} color="#adb5bd" style={{ marginRight: 10 }} />
                            <TextInput placeholderTextColor="#64748b" style={styles.searchInput} placeholder="Ara..." value={search} onChangeText={handleModalSearch} />
                            {search.length > 0 && (
                                <TouchableOpacity onPress={() => handleModalSearch('')}>
                                    <Ionicons name="close-circle" size={20} color="#adb5bd" />
                                </TouchableOpacity>
                            )}
                        </View>

                        {modalLoading ? <ActivityIndicator size="large" color="#0d6efd" style={{ marginTop: 20 }} /> : (
                            <FlatList
                                data={filteredModalData}
                                keyExtractor={(item: any) => item.id.toString()}
                                renderItem={({ item }: any) => {
                                    const isSel = modalSelectedIds.includes(item.id);
                                    return (
                                        <TouchableOpacity style={[styles.subscriberSelectCard, isSel && (isAddMode ? styles.selectedCard : styles.removedCard)]} onPress={() => toggleModalSelection(item.id)}>
                                            <View style={styles.info}>
                                                <Text style={styles.subscriberEmail} numberOfLines={1}>{item.email}</Text>
                                                <Text style={styles.subscriberName}>{item.firstName} {item.lastName}</Text>
                                            </View>
                                            <Ionicons name={isSel ? (isAddMode ? "checkbox" : "remove-circle") : "square-outline"} size={24} color={isSel ? (isAddMode ? "#0d6efd" : "#dc3545") : "#adb5bd"} />
                                        </TouchableOpacity>
                                    );
                                }}
                                ListEmptyComponent={<Text style={{ textAlign: 'center', color: '#6c757d', marginTop: 20 }}>Liste boş.</Text>}
                                keyboardShouldPersistTaps="handled"
                            />
                        )}

                        <TouchableOpacity style={[styles.saveButton, !isAddMode && { backgroundColor: '#dc3545' }]} onPress={handleModalAction} disabled={isSubmitting}>
                            {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{isAddMode ? `Ekle (${modalSelectedIds.length})` : `Çıkar (${modalSelectedIds.length})`}</Text>}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {isSubmitting && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#fff" />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 50, paddingBottom: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3 },
    selectionHeader: { backgroundColor: '#4f46e5', borderBottomColor: '#4338ca', elevation: 8, shadowColor: '#4f46e5', shadowOpacity: 0.4, shadowRadius: 10 },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#212529', flex: 1, textAlign: 'center' },
    leftAction: { flexDirection: 'row', alignItems: 'center' },
    selectionBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginLeft: 10 },
    selectionCount: { color: '#fff', fontWeight: '900', fontSize: 16 },
    selectionLabel: { color: '#fff', fontWeight: '600', fontSize: 13, marginLeft: 6, opacity: 0.9 },
    headerBtn: { padding: 5 },
    actionGroup: { flexDirection: 'row', alignItems: 'center' },
    actionIcon: { padding: 8, marginLeft: 2 },
    headerDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 8 },
    deleteAction: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, marginLeft: 10 },
    summaryBox: { padding: 12, backgroundColor: '#e7f0ff', marginHorizontal: 20, marginTop: 15, borderRadius: 10, borderWidth: 1, borderColor: '#cce5ff' },
    summaryText: { color: '#004085', fontSize: 13, textAlign: 'center' },
    listContainer: { padding: 15, paddingBottom: 100 },
    subscriberCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, borderWidth: 1, borderColor: 'transparent' },
    selectedCard: { borderColor: '#0d6efd', backgroundColor: '#f0f7ff' },
    removedCard: { borderColor: '#dc3545', backgroundColor: '#fff5f5' },
    iconContainer: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e8f5e9', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    subscriberInfo: { flex: 1 },
    subscriberEmail: { fontSize: 14, fontWeight: 'bold', color: '#212529' },
    subscriberName: { fontSize: 12, color: '#6c757d', marginTop: 2 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    statusText: { fontSize: 10, fontWeight: 'bold' },
    emptyContainer: { alignItems: 'center', marginTop: 50 },
    emptyText: { color: '#6c757d', marginTop: 10, fontSize: 16 },
    fabContainer: { position: 'absolute', flexDirection: 'row', right: 20, bottom: 30 },
    fab: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d6efd', borderRadius: 28, elevation: 5, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3 },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContent: { backgroundColor: '#fff', padding: 20, borderTopLeftRadius: 25, borderTopRightRadius: 25, elevation: 10 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#212529' },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f9fa', paddingHorizontal: 15, borderRadius: 12, height: 45, marginBottom: 15, borderWidth: 1, borderColor: '#dee2e6' },
    statusFilters: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginTop: 10, marginBottom: 5 },
    filterBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOpacity: 0.05 },
    activeFilterBtn: { backgroundColor: '#e7f0ff', borderWidth: 1, borderColor: '#0d6efd' },
    filterBtnText: { fontSize: 13, color: '#6c757d', fontWeight: '600' },
    activeFilterBtnText: { color: '#0d6efd' },
    searchInput: { flex: 1, fontSize: 15, color: '#333' },
    subscriberSelectCard: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 12, marginBottom: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#f1f3f5' },
    info: { flex: 1 },
    saveButton: { backgroundColor: '#0d6efd', padding: 15, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
    saveButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    swipeDeleteBtn: { backgroundColor: '#dc3545', justifyContent: 'center', alignItems: 'center', width: 75, marginBottom: 10, borderRadius: 12, flexDirection: 'column', gap: 4 },
    swipeDeleteText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
