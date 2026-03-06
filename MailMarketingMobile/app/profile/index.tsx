import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, Platform, ScrollView, ActivityIndicator, Modal, TextInput } from 'react-native';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '@/constants/Config';
import { useAlert } from '@/context/AlertContext';

export default function ProfileScreen() {
    const router = useRouter();
    const { showAlert } = useAlert();
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Şifre Değiştirme State'leri
    const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordLoading, setPasswordLoading] = useState(false);

    // E-posta Değiştirme State'leri
    const [isEmailModalVisible, setIsEmailModalVisible] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [emailCode, setEmailCode] = useState('');
    const [emailStep, setEmailStep] = useState<'input' | 'verify'>('input');
    const [emailLoading, setEmailLoading] = useState(false);
    const [timer, setTimer] = useState(0);

    // Kullanıcı Bilgileri State'leri
    const [isInfoModalVisible, setIsInfoModalVisible] = useState(false);
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [infoLoading, setInfoLoading] = useState(false);

    useEffect(() => { fetchProfile(); }, []);

    useEffect(() => {
        let interval: any;
        if (timer > 0) {
            interval = setInterval(() => {
                setTimer((prev) => prev - 1);
            }, 1000);
        } else {
            clearInterval(interval);
        }
        return () => clearInterval(interval);
    }, [timer]);

    const fetchProfile = async () => {
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            const res = await axios.get(`${API_URL}/Auth/profile`, { headers: { Authorization: `Bearer ${token}` } });
            setUser(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteAccount = async () => {
        showAlert({
            title: "Hesabı Sil",
            message: "Bu hesabı kalıcı olarak silmek istediğine emin misin?",
            type: 'confirm',
            showCancel: true,
            confirmText: "Evet, Sil",
            cancelText: "İptal",
            onConfirm: async () => {
                try {
                    const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
                    await axios.delete(`${API_URL}/Auth/account`, { headers: { Authorization: `Bearer ${token}` } });

                    // Oturumu temizle
                    if (Platform.OS === 'web') localStorage.removeItem('userToken');
                    else await SecureStore.deleteItemAsync('userToken');

                    router.replace('/login');
                } catch (e) {
                    showAlert({ title: "Hata", message: "Hesap silinirken bir hata oluştu.", type: 'error' });
                }
            }
        });
    };

    const handleChangePassword = async () => {
        if (!oldPassword || !newPassword || !confirmPassword) {
            Alert.alert("Hata", "Lütfen tüm alanları doldurun.");
            return;
        }

        if (newPassword !== confirmPassword) {
            Alert.alert("Hata", "Yeni şifreler eşleşmiyor.");
            return;
        }

        setPasswordLoading(true);
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            const res = await axios.post(`${API_URL}/Auth/change-password`, {
                oldPassword,
                newPassword,
                confirmPassword
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            showAlert({ title: "Başarılı", message: res.data.message, type: 'success' });
            setIsPasswordModalVisible(false);
            setOldPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            showAlert({ title: "Hata", message, type: 'error' });
        } finally {
            setPasswordLoading(false);
        }
    };

    const handleRequestEmailChange = async () => {
        if (!newEmail) {
            showAlert({ title: "Hata", message: "Lütfen yeni e-posta adresinizi girin.", type: 'warning' });
            return;
        }

        setEmailLoading(true);
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            await axios.post(`${API_URL}/Auth/request-email-change`, { newEmail }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setEmailStep('verify');
            setTimer(60);
            showAlert({ title: "Başarılı", message: "Doğrulama kodu e-posta adresinize gönderildi.", type: 'success' });
        } catch (error: any) {
            showAlert({ title: "Hata", message, type: 'error' });
        } finally {
            setEmailLoading(false);
        }
    };

    const handleVerifyEmailChange = async () => {
        if (!emailCode) {
            showAlert({ title: "Hata", message: "Lütfen doğrulama kodunu girin.", type: 'warning' });
            return;
        }

        setEmailLoading(true);
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            const res = await axios.post(`${API_URL}/Auth/verify-email-change`, { code: emailCode }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            showAlert({ title: "Başarılı", message: res.data.message, type: 'success' });
            setIsEmailModalVisible(false);
            setEmailStep('input');
            setNewEmail('');
            setEmailCode('');
            fetchProfile(); // Profili yenile
        } catch (error: any) {
            showAlert({ title: "Hata", message, type: 'error' });
        } finally {
            setEmailLoading(false);
        }
    };

    const handleUpdateProfileInfo = async () => {
        if (!firstName || !lastName) {
            showAlert({ title: "Hata", message: "Lütfen isim ve soyisim alanlarını doldurun.", type: 'warning' });
            return;
        }

        setInfoLoading(true);
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            const res = await axios.put(`${API_URL}/Auth/profile-info`, {
                firstName,
                lastName
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            showAlert({ title: "Başarılı", message: res.data.message, type: 'success' });
            setIsInfoModalVisible(false);
            fetchProfile(); // Bilgileri yenile
        } catch (error: any) {
            showAlert({ title: "Hata", message, type: 'error' });
        } finally {
            setInfoLoading(false);
        }
    };

    const openInfoModal = () => {
        setFirstName(user?.firstName || '');
        setLastName(user?.lastName || '');
        setIsInfoModalVisible(true);
    };

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#6366f1" /></View>;

    return (
        <ScrollView style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#1e293b" /></TouchableOpacity>
                <Text style={styles.headerTitle}>Hesap Paneli</Text>
                <View style={{ width: 24 }} />
            </View>

            <View style={styles.profileBox}>
                <View style={styles.avatarLarge}>
                    <Text style={styles.avatarText}>{user?.firstName?.[0]}</Text>
                </View>
                <Text style={styles.userName}>{user?.firstName} {user?.lastName}</Text>
                <Text style={styles.userEmail}>{user?.email}</Text>
                {user?.isAdmin && <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>YÖNETİCİ PLATFORMU</Text></View>}
            </View>

            <View style={styles.menuSection}>
                <Text style={styles.sectionLabel}>AJANS & MARKA</Text>
                <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/profile/branding' as any)}>
                    <View style={[styles.menuIcon, { backgroundColor: '#e0e7ff' }]}><Ionicons name="color-palette" size={20} color="#6366f1" /></View>
                    <Text style={styles.menuText}>Marka & Görünürlük</Text>
                    <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItem} onPress={openInfoModal}>
                    <View style={[styles.menuIcon, { backgroundColor: '#ecfdf5' }]}><Ionicons name="person-circle" size={20} color="#10b981" /></View>
                    <Text style={styles.menuText}>Kullanıcı Bilgileri</Text>
                    <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItem} onPress={() => setIsPasswordModalVisible(true)}>
                    <View style={[styles.menuIcon, { backgroundColor: '#fef3c7' }]}><Ionicons name="key" size={20} color="#f59e0b" /></View>
                    <Text style={styles.menuText}>Şifre Değiştir</Text>
                    <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItem} onPress={() => setIsEmailModalVisible(true)}>
                    <View style={[styles.menuIcon, { backgroundColor: '#dcfce7' }]}><Ionicons name="mail" size={20} color="#16a34a" /></View>
                    <Text style={styles.menuText}>E-posta Değiştir</Text>
                    <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
                </TouchableOpacity>
            </View>

            <View style={styles.menuSection}>
                <Text style={styles.sectionLabel}>SİSTEM</Text>
                {user?.isAdmin && (
                    <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/users' as any)}>
                        <View style={[styles.menuIcon, { backgroundColor: '#fff7ed' }]}><Ionicons name="shield-checkmark" size={20} color="#f59e0b" /></View>
                        <Text style={styles.menuText}>Kullanıcı Yönetimi</Text>
                        <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
                    </TouchableOpacity>
                )}

                <TouchableOpacity style={[styles.menuItem, { marginTop: 10 }]} onPress={handleDeleteAccount}>
                    <View style={[styles.menuIcon, { backgroundColor: '#fef2f2' }]}><Ionicons name="trash" size={20} color="#ef4444" /></View>
                    <Text style={[styles.menuText, { color: '#ef4444' }]}>Hesabı Sil</Text>
                </TouchableOpacity>
            </View>

            <Text style={styles.version}>Versiyon 2.1.0 SaaS Premium</Text>

            {/* Şifre Değiştirme Modalı */}
            <Modal
                transparent={true}
                visible={isPasswordModalVisible}
                animationType="slide"
                onRequestClose={() => setIsPasswordModalVisible(false)}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setIsPasswordModalVisible(false)}
                >
                    <TouchableOpacity
                        activeOpacity={1}
                        style={styles.modalContent}
                        onPress={() => { }} // İçeriğe tıklayınca overlay'e geçmesini engellar
                    >
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Şifre Değiştir</Text>
                            <TouchableOpacity onPress={() => setIsPasswordModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#64748b" />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.inputLabel}>Mevcut Şifre</Text>
                        <TextInput placeholderTextColor="#64748b"
                            style={styles.input}
                            placeholder="Eski şifrenizi girin"
                            secureTextEntry
                            value={oldPassword}
                            onChangeText={setOldPassword}
                        />

                        <Text style={styles.inputLabel}>Yeni Şifre</Text>
                        <TextInput placeholderTextColor="#64748b"
                            style={styles.input}
                            placeholder="Yeni şifrenizi girin"
                            secureTextEntry
                            value={newPassword}
                            onChangeText={setNewPassword}
                        />

                        <Text style={styles.inputLabel}>Yeni Şifre (Tekrar)</Text>
                        <TextInput placeholderTextColor="#64748b"
                            style={styles.input}
                            placeholder="Yeni şifrenizi tekrar girin"
                            secureTextEntry
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                        />

                        <View style={styles.infoBox}>
                            <Ionicons name="information-circle-outline" size={16} color="#6366f1" />
                            <Text style={styles.infoText}>Şifreniz en az 8 karakter olmalı; büyük/küçük harf ve rakam içermelidir.</Text>
                        </View>

                        <TouchableOpacity
                            style={[styles.saveButton, passwordLoading && { opacity: 0.7 }]}
                            onPress={handleChangePassword}
                            disabled={passwordLoading}
                        >
                            {passwordLoading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.saveButtonText}>Şifreyi Güncelle</Text>
                            )}
                        </TouchableOpacity>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            {/* E-posta Değiştirme Modalı */}
            <Modal
                transparent={true}
                visible={isEmailModalVisible}
                animationType="slide"
                onRequestClose={() => setIsEmailModalVisible(false)}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setIsEmailModalVisible(false)}
                >
                    <TouchableOpacity
                        activeOpacity={1}
                        style={styles.modalContent}
                        onPress={() => { }}
                    >
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>E-posta Değiştir</Text>
                            <TouchableOpacity onPress={() => setIsEmailModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#64748b" />
                            </TouchableOpacity>
                        </View>

                        {emailStep === 'input' ? (
                            <>
                                <Text style={styles.inputLabel}>Yeni E-posta Adresi</Text>
                                <TextInput placeholderTextColor="#64748b"
                                    style={styles.input}
                                    placeholder="Yeni mail adresinizi yazın"
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    value={newEmail}
                                    onChangeText={setNewEmail}
                                />
                                <TouchableOpacity
                                    style={[styles.saveButton, emailLoading && { opacity: 0.7 }]}
                                    onPress={handleRequestEmailChange}
                                    disabled={emailLoading}
                                >
                                    {emailLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Kod Gönder</Text>}
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <Text style={styles.infoTextMain}>
                                    <Text style={{ fontWeight: '800' }}>{newEmail}</Text> adresine gönderilen 6 haneli kodu giriniz.
                                </Text>

                                <Text style={styles.inputLabel}>Doğrulama Kodu</Text>
                                <TextInput placeholderTextColor="#64748b"
                                    style={[styles.input, timer === 0 && { backgroundColor: '#f1f5f9', color: '#94a3b8' }]}
                                    placeholder="000000"
                                    keyboardType="number-pad"
                                    maxLength={6}
                                    value={emailCode}
                                    onChangeText={setEmailCode}
                                    editable={timer > 0 && !emailLoading}
                                />

                                {timer === 0 && (
                                    <View style={[styles.infoBox, { backgroundColor: '#fee2e2', marginTop: 10 }]}>
                                        <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
                                        <Text style={[styles.infoText, { color: '#ef4444' }]}>Doğrulama süresi doldu. Lütfen kodu tekrar gönderin.</Text>
                                    </View>
                                )}

                                <TouchableOpacity
                                    style={[styles.saveButton, (emailLoading || timer === 0) && { opacity: 0.7 }]}
                                    onPress={handleVerifyEmailChange}
                                    disabled={emailLoading || timer === 0}
                                >
                                    {emailLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>E-posta'yı Güncelle</Text>}
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.resendButton, timer > 0 && { opacity: 0.5 }]}
                                    onPress={handleRequestEmailChange}
                                    disabled={timer > 0 || emailLoading}
                                >
                                    <Text style={styles.resendButtonText}>
                                        {timer > 0 ? `Tekrar Gönder (${timer}s)` : 'Kodu Tekrar Gönder'}
                                    </Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
            {/* Kullanıcı Bilgileri Modalı */}
            <Modal
                transparent={true}
                visible={isInfoModalVisible}
                animationType="slide"
                onRequestClose={() => setIsInfoModalVisible(false)}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setIsInfoModalVisible(false)}
                >
                    <TouchableOpacity
                        activeOpacity={1}
                        style={styles.modalContent}
                        onPress={() => { }}
                    >
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Kullanıcı Bilgileri</Text>
                            <TouchableOpacity onPress={() => setIsInfoModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#64748b" />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.inputLabel}>İsim</Text>
                        <TextInput placeholderTextColor="#64748b"
                            style={styles.input}
                            placeholder="Adınızı girin"
                            value={firstName}
                            onChangeText={setFirstName}
                        />

                        <Text style={styles.inputLabel}>Soyisim</Text>
                        <TextInput placeholderTextColor="#64748b"
                            style={styles.input}
                            placeholder="Soyadınızı girin"
                            value={lastName}
                            onChangeText={setLastName}
                        />

                        <TouchableOpacity
                            style={[styles.saveButton, infoLoading && { opacity: 0.7 }]}
                            onPress={handleUpdateProfileInfo}
                            disabled={infoLoading}
                        >
                            {infoLoading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.saveButtonText}>Bilgileri Güncelle</Text>
                            )}
                        </TouchableOpacity>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 25, paddingTop: Platform.OS === 'ios' ? 60 : 50, backgroundColor: '#fff' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#333' },
    profileBox: { alignItems: 'center', padding: 30, backgroundColor: '#fff', borderBottomLeftRadius: 40, borderBottomRightRadius: 40, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05 },
    avatarLarge: { width: 90, height: 90, borderRadius: 30, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center', marginBottom: 15, elevation: 8, shadowColor: '#6366f1', shadowOpacity: 0.3, shadowRadius: 10 },
    avatarText: { fontSize: 36, fontWeight: '900', color: '#fff' },
    userName: { fontSize: 22, fontWeight: '800', color: '#333' },
    userEmail: { fontSize: 14, color: '#64748b', marginTop: 4 },
    adminBadge: { backgroundColor: '#333', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, marginTop: 15 },
    adminBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
    menuSection: { marginTop: 30, paddingHorizontal: 25 },
    sectionLabel: { fontSize: 11, fontWeight: '800', color: '#94a3b8', marginLeft: 10, marginBottom: 15, letterSpacing: 1 },
    menuItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 20, marginBottom: 10, borderWidth: 1, borderColor: '#f1f5f9' },
    menuIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    menuText: { flex: 1, fontSize: 15, fontWeight: '700', color: '#334155' },
    version: { textAlign: 'center', marginTop: 40, marginBottom: 40, fontSize: 12, color: '#cbd5e1', fontWeight: 'bold' },

    // Modal Stilleri
    modalOverlay: { flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 30, paddingBottom: 50 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
    modalTitle: { fontSize: 20, fontWeight: '800', color: '#333' },
    inputLabel: { fontSize: 14, fontWeight: '700', color: '#475569', marginBottom: 8, marginTop: 15 },
    input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, padding: 15, fontSize: 16, color: '#333' },
    saveButton: { backgroundColor: '#6366f1', padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 30, elevation: 4, shadowColor: '#6366f1', shadowOpacity: 0.3, shadowRadius: 10 },
    saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    infoBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eef2ff', padding: 12, borderRadius: 12, marginTop: 20 },
    infoText: { flex: 1, fontSize: 12, color: '#4f46e5', marginLeft: 8, fontWeight: '600' },
    infoTextMain: { fontSize: 14, color: '#475569', lineHeight: 20, marginBottom: 10 },
    resendButton: { marginTop: 20, padding: 10, alignItems: 'center' },
    resendButtonText: { color: '#6366f1', fontSize: 14, fontWeight: '700' }
});
