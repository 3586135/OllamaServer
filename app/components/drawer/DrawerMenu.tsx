import React, {useEffect, useState} from 'react';
import {Platform, SafeAreaView, Text, TouchableNativeFeedback, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import 'react-native-gesture-handler';
import {createDrawerNavigator, DrawerContentScrollView, DrawerItem} from "@react-navigation/drawer";
import HomePage from "../../home/HomePage.tsx";
import {ConversationSummary} from "../../model/Conversation.ts";
import {StorageEvent, getAllSummaries, subscribe, unsubscribe, deleteConversation} from "../../utils/Storage.ts";
import {useAppTheme} from "../../theme/ThemeContext.tsx";
import {Button, Dialog, Divider, Portal} from "react-native-paper";
import {getStyles} from './DrawerMenuStyles.tsx'
import {useTranslation} from "react-i18next";
import {logger} from "../../utils/LogUtils.ts";

const HomeDrawer = () => {
    const Drawer = createDrawerNavigator();
    const { t, i18n } = useTranslation();
    const log = logger.createModuleLogger('HomeDrawer');

    // 当前选中的conversationId
    const [selectedConversationId, setSelectedConversationId] = useState('')
    const updateConversationId = (conversationId: string) => {
        setSelectedConversationId(conversationId)
    }

    const DrawerMenu = (props: any) => {
        const styles = getStyles();
        const theme = useAppTheme();
        const [summaries, setSummaries] = useState<ConversationSummary[]>([]);
        const [deleteConversationDialog, setDeleteConversationDialog] = useState(false)
        // 需要删除的对话信息
        const [deleteConversationSummary, setDeleteConversationSummary] = useState<ConversationSummary>()

        useEffect(() => {
            const handleSummariesUpdate = async () => {
                getAllSummaries()
                    .then((data)=>{
                        setSummaries(data);
                    })
                    .catch((err)=>{
                        log.error(`Get All Summaries error: ${err}`)
                    })

            };
            handleSummariesUpdate();
            subscribe(StorageEvent.SUMMARIES_UPDATED, handleSummariesUpdate);
            return () => {
                unsubscribe(StorageEvent.SUMMARIES_UPDATED, handleSummariesUpdate);
            };
        }, []);

        const handleDeleteConversation = () => {
            if (deleteConversationSummary) {
                deleteConversation(deleteConversationSummary!!.id)
                    .catch((err)=>{
                        log.error(`Delete Conversation ${deleteConversationSummary} error: ${err}`)
                    })
                    .finally(()=>{
                        if (deleteConversationSummary.id == selectedConversationId) {
                            props.navigation.navigate('Home', {
                                conversationId: undefined,
                                timestamp: Date.now(),
                                updateConversationId: updateConversationId
                            })
                        }
                        setDeleteConversationDialog(false)
                        setDeleteConversationSummary(undefined)
                    })
            } else {
                setDeleteConversationDialog(false)
            }

        }

        return (
            <View style={styles.container}>
                <SafeAreaView style={styles.safeArea}>
                    <DrawerContentScrollView {...props}>
                        <DrawerItem
                            label={t('settings')}
                            labelStyle={{color: theme.colors.onSurface}}
                            icon={() => <Icon name="settings" size={24} color={theme.colors.onSurface} />}
                            onPress={() => props.navigation.navigate('Settings')}
                        />
                        <Divider />
                        {/* 历史对话列表 */}
                        {summaries
                            .sort((a, b) => b.lastConversation.localeCompare(a.lastConversation))
                            .map(summary => (
                                <View
                                    key={summary.id}
                                    style={styles.listItemContainer}
                                >
                                    <TouchableNativeFeedback
                                        onPress={() => {
                                            setSelectedConversationId(summary.id)
                                            props.navigation.navigate('Home', {
                                                conversationId: summary.id,
                                                timestamp: Date.now(),
                                                updateConversationId: updateConversationId
                                            })
                                        }}
                                        onLongPress={() => {
                                            setDeleteConversationSummary(summary)
                                            setDeleteConversationDialog(true)
                                        }}
                                        background={TouchableNativeFeedback.Ripple(
                                            theme.colors.primary + '20',
                                            false,
                                        )}
                                    >
                                        <View style={styles.drawerItemContainer}>
                                            <Icon
                                                name={selectedConversationId === summary.id ? "location-pin" : "history"}
                                                size={24}
                                                color={theme.colors.onSurface}
                                                style={styles.icon}
                                            />
                                            <Text
                                                style={[styles.label, { color: theme.colors.onSurface }]}
                                                numberOfLines={1}
                                                ellipsizeMode="tail"
                                            >
                                                {summary.summary}
                                            </Text>
                                        </View>
                                    </TouchableNativeFeedback>
                                </View>
                            ))}
                    </DrawerContentScrollView>
                    <Portal>
                        <Dialog visible={deleteConversationDialog}>
                            <Dialog.Title>{t('deleteConversationTitle')}</Dialog.Title>
                            <Dialog.Content>
                                <Text style={styles.text}>{t('deleteConversationMsg')} {deleteConversationSummary?.summary}?</Text>
                            </Dialog.Content>
                            <Dialog.Actions>
                                <Button onPress={() => handleDeleteConversation()}>{t('ok')}</Button>
                                <Button onPress={() => setDeleteConversationDialog(false)}>{t('cancel')}</Button>
                            </Dialog.Actions>
                        </Dialog>
                    </Portal>
                </SafeAreaView>
            </View>
        );
    };

    return (
        <Drawer.Navigator
            drawerContent={(props) => <DrawerMenu {...props} />}
            screenOptions={{
                headerShown: false,
                drawerStyle: {
                    borderTopRightRadius: 20,
                    borderBottomRightRadius: 20,
                    overflow: 'hidden'
                },
            }}
        >
            <Drawer.Screen
                name="Home"
                component={HomePage}
                initialParams={{
                    conversationId: undefined,
                    timestamp: Date.now(),
                    updateConversationId: updateConversationId
                }}
            />
        </Drawer.Navigator>
    );
};
export default HomeDrawer;
