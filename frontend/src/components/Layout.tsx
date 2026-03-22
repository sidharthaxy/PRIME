import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, StatusBar, Text, TouchableOpacity, Dimensions, Animated, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { router } from 'expo-router';
import { auth } from '../config/firebase';
import { signOut, User } from 'firebase/auth';

const { width, height } = Dimensions.get('window');

export default function Layout({ children }: { children: React.ReactNode }) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isMenuMounted, setIsMenuMounted] = useState(false);
    const [user, setUser] = useState<User | null>(null);

    const slideAnim = useRef(new Animated.Value(-width)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (isMenuOpen) {
            setIsMenuMounted(true);
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                })
            ]).start();
        } else if (isMenuMounted) {
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: -width,
                    duration: 250,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 250,
                    useNativeDriver: true,
                })
            ]).start(() => {
                setIsMenuMounted(false);
            });
        }
    }, [isMenuOpen]);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((currentUser) => {
            setUser(currentUser);
        });
        return unsubscribe;
    }, []);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            setIsMenuOpen(false);
            router.replace('/auth');
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    const navigateTo = (path: any) => {
        setIsMenuOpen(false);
        router.push(path);
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity 
                    onPress={() => setIsMenuOpen(true)} 
                    style={[styles.hamburgerBtn, !user && { opacity: 0.5 }]}
                    disabled={!user}
                >
                    <FontAwesome5 name="bars" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.brandText}>PRIME</Text>
            </View>

            <View style={styles.content}>
                {children}
            </View>

            {/* Sidebar Overlay */}
            {isMenuMounted && (
                <View style={styles.overlayContainer}>
                    <TouchableWithoutFeedback onPress={() => setIsMenuOpen(false)}>
                        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} />
                    </TouchableWithoutFeedback>
                    <Animated.View style={[styles.sidebar, { transform: [{ translateX: slideAnim }] }]}>
                        <View style={styles.sidebarHeader}>
                            <FontAwesome5 name="user-circle" size={50} color="#007AFF" />
                            <Text style={styles.sidebarUserEmail} numberOfLines={1}>
                                {user?.email || 'Guest User'}
                            </Text>
                            {user?.displayName && (
                                <Text style={styles.sidebarUserName} numberOfLines={1}>
                                    {user.displayName}
                                </Text>
                            )}
                        </View>
                        
                        <View style={styles.sidebarMenu}>
                            <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('/dashboard')}>
                                <FontAwesome5 name="th-large" size={20} color="#555" style={styles.menuIcon} />
                                <Text style={styles.menuText}>Dashboard</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('/consumption-log')}>
                                <FontAwesome5 name="chart-line" size={20} color="#555" style={styles.menuIcon} />
                                <Text style={styles.menuText}>Consumption Log</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('/bill-predictor')}>
                                <FontAwesome5 name="file-invoice-dollar" size={20} color="#555" style={styles.menuIcon} />
                                <Text style={styles.menuText}>Bill Predictor</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('/energy-tips')}>
                                <FontAwesome5 name="lightbulb" size={20} color="#555" style={styles.menuIcon} />
                                <Text style={styles.menuText}>Energy Tips</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('/subscription')}>
                                <FontAwesome5 name="star" size={20} color="#555" style={styles.menuIcon} />
                                <Text style={styles.menuText}>Subscription</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.sidebarFooter}>
                            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                                <FontAwesome5 name="sign-out-alt" size={20} color="red" style={styles.menuIcon} />
                                <Text style={styles.logoutText}>Logout</Text>
                            </TouchableOpacity>
                        </View>
                    </Animated.View>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
        paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        zIndex: 1,
    },
    hamburgerBtn: {
        padding: 5,
        marginRight: 15,
    },
    brandText: {
        fontSize: 22,
        fontWeight: '900',
        color: '#007AFF', // Bold blue color
        letterSpacing: 1,
    },
    content: {
        flex: 1,
    },
    overlayContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        flexDirection: 'row',
        elevation: 10,
    },
    backdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    sidebar: {
        width: width > 400 ? 300 : width * 0.75,
        height: '100%',
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 5, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 15,
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
    },
    sidebarHeader: {
        padding: 30,
        paddingTop: 50,
        backgroundColor: '#f8f9fc',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        alignItems: 'center',
    },
    sidebarUserEmail: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#333',
        marginTop: 15,
    },
    sidebarUserName: {
        fontSize: 12,
        color: '#666',
        marginTop: 5,
    },
    sidebarMenu: {
        flex: 1,
        paddingTop: 20,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 15,
        paddingHorizontal: 25,
    },
    menuIcon: {
        width: 30,
        textAlign: 'center',
    },
    menuText: {
        fontSize: 16,
        color: '#444',
        fontWeight: '500',
        marginLeft: 10,
    },
    sidebarFooter: {
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: '#eee',
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 15,
        paddingHorizontal: 5,
    },
    logoutText: {
        fontSize: 16,
        color: 'red',
        fontWeight: 'bold',
        marginLeft: 10,
    },
});
