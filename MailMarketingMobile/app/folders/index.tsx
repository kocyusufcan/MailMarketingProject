import React, { useState, useRef } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, ActivityIndicator, Platform, Modal, TextInput, BackHandler } from 'react-native';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '@/constants/Config';
import { useAlert } from '@/context/AlertContext';
import { Swipeable } from 'react-native-gesture-handler';

export default function FoldersScreen() {
    const { showAlert } = useAlert();
    const swipeableRefs = useRef<{ [key: number]: Swipeable | null }>({});
    const [folders, setFolders] = useState([]);
    const [filteredFolders, setFilteredFolders] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);

    const [modalVisible, setModalVisible] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [editingFolderId, setEditingFolderId] = useState<number | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const router = useRouter();

    useFocusEffect(
        React.useCallback(() => {
            fetchFolders();

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
        }, [selectionMode])
    );

    const fetchFolders = async () => {
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            const response = await axios.get(`${API_URL}/Subscribers/folders`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setFolders(response.data);
            applySearch(search, response.data);
        } catch (error: any) {
            showAlert({ title: "Hata", message: "Klasörler yüklenemedi.", type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const applySearch = (text: string, data = folders) => {
        const sourceData = Array.isArray(data) ? data : [];
        if (!text) {
            setFilteredFolders(sourceData);
            return;
        }
        const filtered = sourceData.filter((f: any) =>
            (f.groupName || "").toLowerCase().includes(text.toLowerCase())
        );
        setFilteredFolders(filtered);
    };

    const handleSearch = (text: string) => {
        setSearch(text);
        applySearch(text);
    };

    const cancelSelection = () => {
        setSelectionMode(false);
        setSelectedIds([]);
    };

    const toggleSelectAll = () => {
        // Sadece sistem klasörü olmayanları seçilebilir kabul ediyoruz
        const selectableIds = filteredFolders
            .filter((f: any) => !f.isSystem)
            .map((f: any) => f.id);

        if (selectableIds.length === 0) return;

        const allSelected = selectableIds.every(id => selectedIds.includes(id));

        if (allSelected) {
            const newSelection = selectedIds.filter(id => !selectableIds.includes(id));
            setSelectedIds(newSelection);
            if (newSelection.length === 0) setSelectionMode(false);
        } else {
            const newSelection = Array.from(new Set([...selectedIds, ...selectableIds]));
            setSelectedIds(newSelection);
        }
    };

    const toggleSelect = (id: number, isSystem: boolean) => {
        if (isSystem) return; // Sistem klasörleri toplu silinemez

        if (selectedIds.includes(id)) {
            const newSelection = selectedIds.filter(sid => sid !== id);
            setSelectedIds(newSelection);
            if (newSelection.length === 0) setSelectionMode(false);
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const handleLongPress = (id: number, isSystem: boolean) => {
        if (isSystem) return;
        if (!selectionMode) {
            setSelectionMode(true);
            setSelectedIds([id]);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;

        showAlert({
            title: "Toplu Klasör Sil",
            message: "Seçilen klasörleri silmek istediğinize emin misiniz? (Aboneler silinmez, sistem klasörleri atlanır)",
            type: 'confirm',
            showCancel: true,
            confirmText: "Evet",
            cancelText: "Vazgeç",
            onConfirm: async () => {
                setIsSubmitting(true);
                try {
                    const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
                    const res = await axios.post(`${API_URL}/Subscribers/bulk-delete-folders`, selectedIds, { headers: { Authorization: `Bearer ${token}` } });
                    showAlert({ title: "Başarılı", message: res.data.message, type: 'success' });
                    cancelSelection();
                    fetchFolders();
                } catch (e: any) {
                    showAlert({ title: "Hata", message: "İşlem yapılamadı.", type: 'error' });
                } finally {
                    setIsSubmitting(false);
                }
            }
        });
    };

    const handleCreateOrUpdate = async () => {
        if (!newFolderName.trim()) {
            setModalVisible(false);
            setTimeout(() => {
                showAlert({ title: "Uyarı", message: "Lütfen bir ad girin.", type: 'warning' });
            }, 300);
            return;
        }
        setIsSubmitting(true);
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            if (editingFolderId) {
                await axios.put(`${API_URL}/Subscribers/rename-folder/${editingFolderId}`, `"${newFolderName}"`, {
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
                });
            } else {
                await axios.post(`${API_URL}/Subscribers/create-folder`, { GroupName: newFolderName }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            }
            setModalVisible(false);
            setNewFolderName('');
            setEditingFolderId(null);
            fetchFolders();
        } catch (error: any) {
            setModalVisible(false); // Modal'ı önce kapat, sonra alert ver (Çift modal çakışmasını önler)
            setTimeout(() => {
                const msg = error.response?.data?.message || "İşlem başarısız.";
                showAlert({ title: "Hata", message: msg, type: 'error' });
            }, 300);
        } finally {
            setIsSubmitting(false);
        }
    };

    const openModal = (id: number | null = null, name: string = '') => {
        setEditingFolderId(id);
        setNewFolderName(name);
        setModalVisible(true);
    };

    const handleSwipeDelete = (folderId: number) => {
        swipeableRefs.current[folderId]?.close();
        showAlert({
            title: "Klasörü Sil",
            message: "Bu klasörü silmek istediğinize emin misiniz? (Aboneler silinmez)",
            type: 'confirm',
            showCancel: true,
            confirmText: "Sil",
            cancelText: "Vazgeç",
            onConfirm: async () => {
                setIsSubmitting(true);
                try {
                    const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
                    const res = await axios.post(`${API_URL}/Subscribers/bulk-delete-folders`, [folderId], { headers: { Authorization: `Bearer ${token}` } });
                    showAlert({ title: "İşlem Başarılı", message: res.data.message, type: 'success' });
                    fetchFolders();
                } catch {
                    showAlert({ title: "Hata", message: "İşlem yapılamadı.", type: 'error' });
                } finally {
                    setIsSubmitting(false);
                }
            }
        });
    };

    const renderRightActions = (folderId: number, folderName: string) => (
        <View style={styles.swipeActionsRow}>
            <TouchableOpacity
                style={styles.swipeEditBtn}
                onPress={() => {
                    swipeableRefs.current[folderId]?.close();
                    openModal(folderId, folderName);
                }}
                activeOpacity={0.8}
            >
                <Ionicons name="pencil" size={20} color="#fff" />
                <Text style={styles.swipeBtnText}>Düzenle</Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={styles.swipeDeleteBtn}
                onPress={() => handleSwipeDelete(folderId)}
                activeOpacity={0.8}
            >
                <Ionicons name="trash" size={20} color="#fff" />
                <Text style={styles.swipeBtnText}>Sil</Text>
            </TouchableOpacity>
        </View>
    );

    const renderItem = React.useCallback(({ item }: any) => {
        const isSelected = selectedIds.includes(item.id);
        const canSwipe = !selectionMode && !item.isSystem;
        return (
            <Swipeable
                ref={(ref) => { swipeableRefs.current[item.id] = ref; }}
                enabled={canSwipe}
                renderRightActions={() => canSwipe ? renderRightActions(item.id, item.groupName) : null}
                rightThreshold={40}
                friction={2}
                overshootRight={false}
            >
                <TouchableOpacity
                    activeOpacity={0.7}
                    style={[styles.card, isSelected && styles.selectedCard]}
                    onPress={() => selectionMode ? toggleSelect(item.id, item.isSystem) : router.push({ pathname: `/folders/${item.id}`, params: { title: item.groupName, isSystem: String(item.isSystem) } } as any)}
                    onLongPress={() => handleLongPress(item.id, item.isSystem)}
                >
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconContainer, { backgroundColor: item.isSystem ? '#f8f9fa' : (isSelected ? '#0d6efd' : '#e7f0ff') }]}>
                            <Ionicons
                                name={isSelected ? "checkbox" : (item.isSystem ? "lock-closed" : "folder")}
                                size={22}
                                color={isSelected ? "#fff" : (item.isSystem ? "#6c757d" : "#0d6efd")}
                            />
                        </View>
                        <View style={styles.info}>
                            <Text style={styles.name}>{item.groupName}</Text>
                            <Text style={styles.desc}>{item.isSystem ? "Sistem Klasörü" : "Özel Grup"}</Text>
                        </View>
                        {!selectionMode && (
                            <Ionicons name="chevron-forward" size={18} color="#ccc" />
                        )}
                    </View>
                </TouchableOpacity>
            </Swipeable>
        );
    }, [selectionMode, selectedIds]);

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
                                    name={
                                        filteredFolders.filter((f: any) => !f.isSystem).length > 0 &&
                                            filteredFolders.filter((f: any) => !f.isSystem).every((f: any) => selectedIds.includes(f.id))
                                            ? "checkmark-done-circle" : "checkmark-circle-outline"
                                    }
                                    size={26}
                                    color="#fff"
                                />
                            </TouchableOpacity>
                            <View style={styles.headerDivider} />
                            <TouchableOpacity onPress={handleBulkDelete} style={[styles.actionIcon, styles.deleteAction]}>
                                <Ionicons name="trash" size={24} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    </>
                ) : (
                    <>
                        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
                            <Ionicons name="arrow-back" size={24} color="#212529" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Klasörlerim</Text>
                        <TouchableOpacity onPress={() => openModal()} style={styles.headerBtn}>
                            <Ionicons name="add-circle" size={26} color="#0d6efd" />
                        </TouchableOpacity>
                    </>
                )}
            </View>

            <View style={styles.searchBar}>
                <Ionicons name="search" size={20} color="#adb5bd" style={{ marginRight: 10 }} />
                <TextInput placeholderTextColor="#64748b"
                    style={styles.searchInput}
                    placeholder="Klasörlerde ara..."
                    value={search}
                    onChangeText={handleSearch}
                />
                {search.length > 0 && (
                    <TouchableOpacity onPress={() => handleSearch('')}>
                        <Ionicons name="close-circle" size={20} color="#adb5bd" />
                    </TouchableOpacity>
                )}
            </View>

            {loading ? <ActivityIndicator size="large" color="#0d6efd" style={{ marginTop: 50 }} /> : (
                <FlatList
                    data={filteredFolders}
                    keyExtractor={(item: any) => item.id.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={{ padding: 15, paddingBottom: 100 }}
                    initialNumToRender={10}
                    maxToRenderPerBatch={10}
                    windowSize={5}
                    removeClippedSubviews={true}
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="folder-open-outline" size={80} color="#dee2e6" />
                            <Text style={styles.emptyTitle}>Klasör Bulunamadı</Text>
                        </View>
                    }
                />
            )}

            <Modal animationType="fade" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{editingFolderId ? "Klasörü Düzenle" : "Yeni Klasör"}</Text>
                        <View style={styles.inputContainer}>
                            <TextInput placeholderTextColor="#64748b" style={styles.input} placeholder="Klasör Adı" value={newFolderName} onChangeText={setNewFolderName} autoFocus />
                            {newFolderName.length > 0 && (
                                <TouchableOpacity style={styles.clearBtn} onPress={() => setNewFolderName('')}>
                                    <Ionicons name="close-circle" size={20} color="#cbd5e1" />
                                </TouchableOpacity>
                            )}
                        </View>
                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}><Text style={styles.cancelBtnText}>Vazgeç</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.saveBtn} onPress={handleCreateOrUpdate} disabled={isSubmitting}>
                                {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Kaydet</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
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
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 50, paddingBottom: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3 },
    selectionHeader: { backgroundColor: '#4f46e5', borderBottomColor: '#4338ca', elevation: 8, shadowColor: '#4f46e5', shadowOpacity: 0.4, shadowRadius: 10 },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#212529' },
    leftAction: { flexDirection: 'row', alignItems: 'center' },
    selectionBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginLeft: 10 },
    selectionCount: { color: '#fff', fontWeight: '900', fontSize: 16 },
    selectionLabel: { color: '#fff', fontWeight: '600', fontSize: 13, marginLeft: 6, opacity: 0.9 },
    headerBtn: { padding: 5 },
    actionGroup: { flexDirection: 'row', alignItems: 'center' },
    actionIcon: { padding: 8, marginLeft: 2 },
    headerDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 8 },
    deleteAction: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, marginLeft: 10 },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 15, paddingHorizontal: 15, borderRadius: 12, height: 50, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05 },
    searchInput: { flex: 1, fontSize: 16, color: '#333' },
    card: { backgroundColor: '#fff', borderRadius: 15, marginBottom: 12, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, borderWidth: 1, borderColor: 'transparent' },
    selectedCard: { borderColor: '#0d6efd', backgroundColor: '#f0f7ff' },
    cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 15 },
    iconContainer: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    info: { flex: 1, marginLeft: 15 },
    name: { fontSize: 16, fontWeight: 'bold', color: '#212529' },
    desc: { fontSize: 12, color: '#adb5bd', marginTop: 2 },
    emptyContainer: { alignItems: 'center', marginTop: 80 },
    emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#495057', marginTop: 20 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: '85%', backgroundColor: '#fff', borderRadius: 20, padding: 25 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
    inputContainer: { position: 'relative', marginBottom: 20 },
    input: { backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#dee2e6', borderRadius: 12, padding: 15, paddingRight: 45, fontSize: 16, color: '#333' },
    clearBtn: { position: 'absolute', right: 12, top: 15 },
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between' },
    cancelBtn: { flex: 1, padding: 15, alignItems: 'center' },
    cancelBtnText: { color: '#dc3545', fontWeight: 'bold' },
    saveBtn: { flex: 1, backgroundColor: '#0d6efd', padding: 15, borderRadius: 12, alignItems: 'center' },
    saveBtnText: { color: '#fff', fontWeight: 'bold' },
    loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    swipeActionsRow: { flexDirection: 'row', marginBottom: 12 },
    swipeEditBtn: { backgroundColor: '#0d6efd', justifyContent: 'center', alignItems: 'center', width: 80, borderRadius: 0, flexDirection: 'column', gap: 4 },
    swipeDeleteBtn: { backgroundColor: '#dc3545', justifyContent: 'center', alignItems: 'center', width: 75, borderTopRightRadius: 15, borderBottomRightRadius: 15, flexDirection: 'column', gap: 4 },
    swipeBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
