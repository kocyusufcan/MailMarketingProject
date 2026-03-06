import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Platform, ActivityIndicator, TextInput, KeyboardAvoidingView, InteractionManager } from 'react-native';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAlert } from '@/context/AlertContext';
import * as Network from 'expo-network';
import { API_URL } from '@/constants/Config';

export default function NewCampaignScreen() {
    const [folders, setFolders] = useState<any[]>([]);
    const [templates, setTemplates] = useState<any[]>([]);
    const [folderSearch, setFolderSearch] = useState('');
    const [templateSearch, setTemplateSearch] = useState('');
    const [selectedFolders, setSelectedFolders] = useState<any[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [isConnected, setIsConnected] = useState(true);
    const { showAlert } = useAlert();
    const router = useRouter();

    useEffect(() => {
        // Navigasyon animasyonu bittikten sonra veri çek — geçiş akıcı olsun
        const task = InteractionManager.runAfterInteractions(() => {
            loadData();
            checkInitialConnection();
        });
        return () => task.cancel();
    }, []);

    const checkInitialConnection = async () => {
        try {
            const state = await Network.getNetworkStateAsync();
            setIsConnected((state.isConnected ?? false) && state.isInternetReachable !== false);
        } catch (e) {
            console.error("Bağlantı kontrolü yapılamadı", e);
        }
    };

    const loadData = async () => {
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            const [fRes, tRes] = await Promise.all([
                axios.get(`${API_URL}/Subscribers/folders`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`${API_URL}/Templates`, { headers: { Authorization: `Bearer ${token}` } })
            ]);
            setFolders(fRes.data);
            setTemplates(tRes.data);
        } catch (e) {
            showAlert({ title: "Hata", message: "Veriler yüklenemedi.", type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const toggleFolder = useCallback((folder: any) => {
        setSelectedFolders(prev => {
            const exists = prev.find(f => f.id === folder.id);
            if (exists) return prev.filter(f => f.id !== folder.id);
            return [...prev, folder];
        });
    }, []);

    const handleSend = async () => {
        // Son bir kez interneti kontrol et
        const state = await Network.getNetworkStateAsync();
        const connected = (state.isConnected ?? false) && state.isInternetReachable !== false;
        setIsConnected(connected);

        if (!connected) {
            showAlert({
                title: "Bağlantı Hatası",
                message: "İnternet bağlantınız olmadığı için gönderim başlatılamaz. Lütfen bağlantınızı kontrol edip tekrar deneyin.",
                type: 'warning'
            });
            return;
        }

        if (selectedFolders.length === 0 || !selectedTemplate) {
            showAlert({ title: "Uyarı", message: "Lütfen en az bir grup ve şablon seçin!", type: 'warning' });
            return;
        }

        showAlert({
            title: "Gönderim Onayı",
            message: `${selectedFolders.length} grup seçildi. "${selectedTemplate.title}" şablonu gönderilsin mi?`,
            type: 'confirm',
            showCancel: true,
            confirmText: "GÖNDER",
            cancelText: "Vazgeç",
            onConfirm: startCampaign
        });
    };

    const startCampaign = async () => {
        setSending(true);
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            const res = await axios.post(`${API_URL}/Campaign/send-to-groups`, {
                groupIds: selectedFolders.map(f => f.id),
                subject: selectedTemplate.title,
                body: selectedTemplate.content,
                templateId: selectedTemplate.id
            }, { headers: { Authorization: `Bearer ${token}` } });

            showAlert({ title: "Başarılı", message: res.data?.message || "Gönderim tamamlandı!", type: 'success' });

            // Yönlendirmeyi kaldırıyoruz, kullanıcının o sayfada kalmasını sağlıyoruz.
            // Sadece formu sıfırlıyoruz.
            setSelectedFolders([]);
            setSelectedTemplate(null);
        } catch (error: any) {
            const errorMsg = error.response?.data?.message || "Mail gönderimi sırasında bir hata oluştu.";
            showAlert({ title: "Hata", message: errorMsg, type: 'error' });
        } finally {
            setSending(false);
        }
    };

    const filteredFolders = useMemo(() => {
        return folders.filter((f: any) =>
            f.groupName.toLowerCase().includes(folderSearch.toLowerCase())
        );
    }, [folders, folderSearch]);

    const filteredTemplates = useMemo(() => {
        return templates.filter((t: any) =>
            t.isActive === true && t.title.toLowerCase().includes(templateSearch.toLowerCase())
        );
    }, [templates, templateSearch]);

    const isFolderSelected = useCallback((id: number) => selectedFolders.some(f => f.id === id), [selectedFolders]);

    // Performans için render fonksiyonları
    const renderFolderItem = ({ item: f }: any) => (
        <TouchableOpacity
            key={f.id}
            style={[styles.miniCard, isFolderSelected(f.id) && styles.selectedCard]}
            onPress={() => toggleFolder(f)}
        >
            <Ionicons
                name={isFolderSelected(f.id) ? "checkmark-circle" : "folder"}
                size={24}
                color={isFolderSelected(f.id) ? "#fff" : "#0d6efd"}
            />
            <Text style={[styles.miniCardText, isFolderSelected(f.id) && { color: '#fff' }]} numberOfLines={1}>{f.groupName}</Text>
        </TouchableOpacity>
    );

    const renderTemplateItem = ({ item: t }: any) => (
        <TouchableOpacity
            key={t.id}
            style={[styles.templateCard, selectedTemplate?.id === t.id && styles.selectedCard]}
            onPress={() => setSelectedTemplate(t)}
        >
            <View style={[styles.iconBox, { backgroundColor: selectedTemplate?.id === t.id ? 'transparent' : '#e7f0ff' }]}>
                <Ionicons name="document-text" size={24} color={selectedTemplate?.id === t.id ? '#fff' : '#0d6efd'} />
            </View>
            <View style={{ flex: 1, marginLeft: 15 }}>
                <Text style={[styles.templateTitle, selectedTemplate?.id === t.id && { color: '#fff' }]}>{t.title}</Text>
                <Text style={[styles.templateDate, selectedTemplate?.id === t.id && { color: '#eee' }]}>{new Date(t.createdDate).toLocaleDateString('tr-TR')}</Text>
            </View>
            {selectedTemplate?.id === t.id && <Ionicons name="checkmark-circle" size={24} color="#fff" />}
        </TouchableOpacity>
    );

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#0d6efd" /></View>;

    // Sayfa içeriğini tek bir FlatList içinde birleştiriyoruz (Virtualization için)
    const listData = [
        { type: 'HEADER_FOLDERS' },
        { type: 'FOLDER_LIST' },
        { type: 'HEADER_TEMPLATES' },
        { type: 'TEMPLATE_LIST' },
        { type: 'FOOTER' }
    ];

    const renderPageSection = ({ item }: any) => {
        switch (item.type) {
            case 'HEADER_FOLDERS':
                return (
                    <View style={styles.content}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>1. Hedef Grupları Seç ({selectedFolders.length})</Text>
                        </View>
                        <View style={styles.searchContainer}>
                            <Ionicons name="search" size={20} color="#adb5bd" style={styles.searchIcon} />
                            <TextInput placeholderTextColor="#64748b"
                                style={styles.searchInput}
                                placeholder="Grup ara..."
                                value={folderSearch}
                                onChangeText={setFolderSearch}
                            />
                            {folderSearch !== '' && (
                                <TouchableOpacity onPress={() => setFolderSearch('')}>
                                    <Ionicons name="close-circle" size={20} color="#adb5bd" />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                );
            case 'FOLDER_LIST':
                return (
                    <View style={{ paddingHorizontal: 20 }}>
                        <FlatList
                            data={filteredFolders}
                            renderItem={renderFolderItem}
                            keyExtractor={(f) => f.id.toString()}
                            numColumns={2}
                            columnWrapperStyle={{ justifyContent: 'space-between' }}
                            scrollEnabled={false} // Ana liste içinde olduğu için
                            ListEmptyComponent={<Text style={styles.emptyText}>Grup bulunamadı.</Text>}
                        />
                    </View>
                );
            case 'HEADER_TEMPLATES':
                return (
                    <View style={[styles.content, { paddingBottom: 0 }]}>
                        <View style={[styles.sectionHeader, { marginTop: 10 }]}>
                            <Text style={styles.sectionTitle}>2. Şablonu Seç</Text>
                        </View>
                        <View style={styles.searchContainer}>
                            <Ionicons name="search" size={20} color="#adb5bd" style={styles.searchIcon} />
                            <TextInput placeholderTextColor="#64748b"
                                style={styles.searchInput}
                                placeholder="Şablon ara..."
                                value={templateSearch}
                                onChangeText={setTemplateSearch}
                            />
                            {templateSearch !== '' && (
                                <TouchableOpacity onPress={() => setTemplateSearch('')}>
                                    <Ionicons name="close-circle" size={20} color="#adb5bd" />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                );
            case 'TEMPLATE_LIST':
                return (
                    <View style={{ paddingHorizontal: 20 }}>
                        <FlatList
                            data={filteredTemplates}
                            renderItem={renderTemplateItem}
                            keyExtractor={(t) => t.id.toString()}
                            scrollEnabled={false}
                            ListEmptyComponent={<Text style={styles.emptyText}>Şablon bulunamadı.</Text>}
                        />
                    </View>
                );
            case 'FOOTER':
                return (
                    <View style={{ padding: 20, paddingBottom: 60 }}>
                        <TouchableOpacity
                            style={[styles.sendButton, (sending || selectedFolders.length === 0 || !selectedTemplate) && { opacity: 0.6 }]}
                            onPress={handleSend}
                            disabled={sending || selectedFolders.length === 0 || !selectedTemplate}
                        >
                            {sending ? <ActivityIndicator color="#fff" /> : (
                                <>
                                    <Text style={styles.sendButtonText}>GÖNDERİMİ BAŞLAT</Text>
                                    <Ionicons name="paper-plane" size={20} color="#fff" style={{ marginLeft: 10 }} />
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                );
            default:
                return null;
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.container}>
                <Stack.Screen options={{ headerShown: false }} />
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#212529" /></TouchableOpacity>
                    <Text style={styles.headerTitle}>Yeni Gönderim</Text>
                </View>

                {!isConnected && (
                    <View style={styles.offlineBar}>
                        <Ionicons name="wifi-outline" size={16} color="#fff" />
                        <Text style={styles.offlineText}>İnternet Bağlantısı Yok. Gönderim Yapılamaz.</Text>
                    </View>
                )}

                <FlatList
                    data={listData}
                    renderItem={renderPageSection}
                    keyExtractor={(item) => item.type}
                    showsVerticalScrollIndicator={false}
                />
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 25, paddingTop: Platform.OS === 'ios' ? 60 : 50, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
    headerTitle: { fontSize: 20, fontWeight: 'bold', marginLeft: 15, color: '#212529' },
    content: { padding: 20 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { fontSize: 13, fontWeight: 'bold', color: '#adb5bd', textTransform: 'uppercase', letterSpacing: 1 },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 12,
        paddingHorizontal: 12,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: '#e9ecef',
        height: 50
    },
    searchIcon: { marginRight: 10 },
    searchInput: { flex: 1, fontSize: 15, color: '#495057', height: '100%' },
    emptyText: { textAlign: 'center', color: '#adb5bd', fontSize: 14, paddingVertical: 20 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    miniCard: { width: '48%', backgroundColor: '#fff', padding: 15, borderRadius: 15, alignItems: 'center', marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05 },
    miniCardText: { marginTop: 8, fontWeight: '600', color: '#495057' },
    selectedCard: { backgroundColor: '#0d6efd', shadowOpacity: 0.3, shadowColor: '#0d6efd' },
    templateCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 15, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05 },
    iconBox: { width: 45, height: 45, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    templateTitle: { fontSize: 16, fontWeight: 'bold', color: '#212529' },
    templateDate: { fontSize: 12, color: '#adb5bd', marginTop: 2 },
    sendButton: { backgroundColor: '#198754', height: 60, borderRadius: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20, elevation: 4, shadowColor: '#198754', shadowOpacity: 0.3 },
    sendButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    offlineBar: {
        backgroundColor: '#dc3545',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 8,
        gap: 8
    },
    offlineText: { color: '#fff', fontSize: 13, fontWeight: '600' }
});
