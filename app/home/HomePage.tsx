import React, {useState, useRef, useEffect} from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    FlatList,
    SafeAreaView,
    KeyboardAvoidingView,
    Platform,
    StyleSheet, ToastAndroid, ListRenderItem, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {NavigationProp, ParamListBase, useNavigation} from '@react-navigation/native';
import ModelSelector from "../components/ModelSelector.tsx";
import {chat, loadModel} from "../api/OllamaApi.ts";
import Markdown, {MarkdownIt} from "react-native-markdown-display";
import {DrawerNavigationProp} from "@react-navigation/drawer";
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import {loadConversation, saveConversation} from "../utils/Storage.ts";
import {getSummary} from "../utils/ChatUtils.ts";
import {useAppTheme} from "../theme/ThemeContext.tsx";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {Dialog, Portal} from "react-native-paper";
import thinkPlugin from '../components/markdown/ThinkPlugin'
import {useTranslation} from "react-i18next";

type HomeScreenNavigationProp = NavigationProp<ParamListBase> & DrawerNavigationProp<ParamListBase>;

const HomePage = ({ route }) => {
    const theme = useAppTheme();
    const { t, i18n } = useTranslation();
    const insets = useSafeAreaInsets();
    // 加载模型
    const [loadingModalVisible, setLoadingModalVisible] = useState(false)
    // 输入消息
    const [message, setMessage] = useState('');
    // 保持用 ref 存储实时数据，state 仅用于触发渲染
    const [_, forceUpdate] = useState({}); // 仅用于触发渲染的 dummy state
    // 使用ref保持最新值
    const messagesRef = useRef<Message[]>([]);
    // 模型选择
    const [selectedModel, setSelectedModel] = useState<string>(t('selectedModel'));
    // 消息列表
    const flatListRef = useRef<FlatList<Message>>(null);
    // 正在接收消息
    const [chatting, setChatting] = useState(false)
    // 接收到的消息请求
    const chatSessionRef = useRef<ChatSessionType | null>(null);
    // 对话唯一标识
    const conversationUuidRef = useRef<string>(uuidv4());
    const rules = MarkdownIt({ typographer: true }).use(thinkPlugin)
    const renderRules = {
        think: (node: any, children: any, parent: any, style: any) => {
            return (
                <View key={node.key} style={[styles.thinkContainer, { flexDirection: 'row' }]}>
                    <View style={styles.thinkIndicator}/>
                    <View>
                        {children}
                    </View>
                </View>
            );
        },
    }

    const navigation = useNavigation<HomeScreenNavigationProp>();

    // effect处理对话加载
    useEffect(() => {
        const loadExistingConversation = async () => {
            if (route.params?.conversationId) {
                const existing = await loadConversation(route.params.conversationId);
                if (existing) {
                    messagesRef.current = existing.messages;
                } else {
                    messagesRef.current = []
                }
                conversationUuidRef.current = route.params.conversationId;
                forceUpdate({})
            } else {
                // 进入APP更新对话id
                route.params?.updateConversationId(conversationUuidRef.current)
                messagesRef.current = []
                forceUpdate({})
            }
        };
        loadExistingConversation();
    }, [route.params?.conversationId, route.params?.timestamp]); // 添加timestamp依赖

    const handleNewPress = () => {
        //已经是新对话
        if (messagesRef.current.length === 0) {
            return
        }
        saveConversation(conversationUuidRef.current, messagesRef.current, getSummary(messagesRef.current))
            .then(r => {

            })
            .catch((err)=>{

            })
            .finally(()=>{
                //更新对话唯一表示
                conversationUuidRef.current = uuidv4();
                route.params?.updateConversationId(conversationUuidRef.current)
                //清除历史消息
                messagesRef.current = []
                forceUpdate({})
            })
    };

    const handleSend = () => {
        if (chatting) {
            chatSessionRef.current?.abort()
            setChatting(false)
            let lastMsg = messagesRef.current[messagesRef.current.length - 1];
            lastMsg.content += t('userCancel')
            messagesRef.current[messagesRef.current.length - 1] = lastMsg;
            forceUpdate({})
            // 保存对话
            saveConversation(conversationUuidRef.current, messagesRef.current, getSummary(messagesRef.current))
            return
        }
        if (message.trim()) {
            setChatting(true)
            let addedAssistantMessage = false
            const userMsg: Message = {
                role: 'user',
                content: message
            }
            messagesRef.current = [...messagesRef.current, userMsg]
            forceUpdate({})
            // 保存对话
            saveConversation(conversationUuidRef.current, messagesRef.current, getSummary(messagesRef.current))
            setMessage('')
            flatListRef.current?.scrollToEnd({ animated: true })

            chatSessionRef.current = chat(selectedModel, messagesRef.current, chatResponse => {
                if (chatResponse.error) {
                    return
                }
                if (!chatResponse.done) {
                    //首次获得回答，添加消息
                    // @ts-ignore
                    if (addedAssistantMessage) {
                        messagesRef.current[messagesRef.current.length - 1].content += chatResponse.message?.content
                        forceUpdate({})
                    } else {
                        addedAssistantMessage = true;
                        // @ts-ignore
                        messagesRef.current = [...messagesRef.current, chatResponse.message]
                        forceUpdate({})
                    }
                }
            })
            chatSessionRef.current.promise.catch(e => {
                ToastAndroid.show(`Chat error ${e}`, ToastAndroid.SHORT)
            }).finally(() => {
                setChatting(false)
                chatSessionRef.current = null
                // 回答完毕后保存对话
                saveConversation(conversationUuidRef.current, messagesRef.current, getSummary(messagesRef.current))
            })
        }
    }

    const handleModelSelect = (model: OllamaModel) => {
        setSelectedModel(model.name);
        setLoadingModalVisible(true);
        loadModel(model.name)
            .then((response: LoadResponse) => {
                if (response.done_reason != 'load') {
                    setSelectedModel(t('assistant'))
                    ToastAndroid.show('Loading Model error', ToastAndroid.SHORT)
                }
                setLoadingModalVisible(false);
            })
            .catch((e) => {
                setSelectedModel(t("selectedModel"))
                setLoadingModalVisible(false);
                ToastAndroid.show(`Loading Model error ${e}`, ToastAndroid.SHORT)
            })
    };

    const renderMessage: ListRenderItem<Message> = ({ item }) => {
        return <View style={[
            styles.messageRow,
            item.role === 'assistant' ? styles.botMessageRow : styles.userMessageRow
        ]}>
            {item.role === 'assistant' && (
                <View style={styles.avatarContainer}>
                    <View style={[
                        styles.avatar,
                        item.role === 'assistant' ? styles.botAvatar : styles.userAvatar
                    ]}>
                        <Text style={styles.avatarText}>
                            {item.role === 'assistant' ? 'AI' : 'U'}
                        </Text>
                    </View>
                </View>
            )}
            <View
                style={[
                    styles.messageContainer,
                    item.role === 'assistant' ? styles.botMessage : styles.userMessage,
                ]}>
                <Markdown
                    style={item.role === 'assistant' ? assistantMarkdownStyles : userMarkdownStyles}
                    markdownit={rules}
                    rules={renderRules}
                >
                    {item.content}
                </Markdown>
            </View>
            {item.role !== 'assistant' && (
                <View style={styles.avatarContainer}>
                    <View style={[
                        styles.avatar,
                        item.role === 'assistant' ? styles.botAvatar : styles.userAvatar
                    ]}>
                        <Text style={styles.avatarText}>
                            {item.role === 'assistant' ? 'AI' : 'U'}
                        </Text>
                    </View>
                </View>
            )}
        </View>
    };

    const assistantMarkdownStyles = {
        heading1: {
            fontSize: 24,
            fontWeight: 'bold',
            color: theme.colors.onSurface,
            marginBottom: 8,
        },
        heading2: {
            fontSize: 20,
            fontWeight: 'bold',
            color: theme.colors.onSurface,
            marginBottom: 8,
        },
        paragraph: {
            fontSize: 16,
            color: theme.colors.onSurface,
            marginBottom: 8,
        },
        code_block: {
            backgroundColor: '#f0f0f0',
            padding: 8,
            borderRadius: 4,
            fontSize: 14,
            color: theme.colors.onSurface,
            fontFamily: 'Courier',
        },
        blockquote: {
            backgroundColor: 'rgba(0,0,0,0)',  // 背景色
            borderLeftColor: 'rgba(0,0,0,0)',  // 左边框颜色
            borderLeftWidth: 0,          // 左边框宽度
            paddingHorizontal: 0,       // 水平内边距
            paddingVertical: 0,          // 垂直内边距
            marginVertical: 0,           // 垂直外边距
            borderRadius: 0,             // 圆角
            fontStyle: 'italic',         // 字体样式
        },
    };

    const userMarkdownStyles = {
        heading1: {
            fontSize: 24,
            fontWeight: 'bold',
            color: theme.colors.surface,
            marginBottom: 8,
        },
        heading2: {
            fontSize: 20,
            fontWeight: 'bold',
            color: '#fff',
            marginBottom: 8,
        },
        paragraph: {
            fontSize: 16,
            color: theme.colors.surface,
            marginBottom: 8,
        },
        code_block: {
            backgroundColor: '#f0f0f0',
            padding: 8,
            borderRadius: 4,
            fontSize: 14,
            color: theme.colors.surface,
            fontFamily: 'Courier',
        },
        blockquote: {
            backgroundColor: 'rgba(0,0,0,0)',  // 背景色
            borderLeftColor: 'rgba(0,0,0,0)',  // 左边框颜色
            borderLeftWidth: 0,          // 左边框宽度
            paddingHorizontal: 0,       // 水平内边距
            paddingVertical: 0,          // 垂直内边距
            marginVertical: 0,           // 垂直外边距
            borderRadius: 0,             // 圆角
            fontStyle: 'italic',         // 字体样式
        },
    };

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.colors.background,
            paddingTop: insets.top,
        },
        safeArea: {
            flex: 1,
        },
        header: {
            height: 60,
            backgroundColor: theme.colors.surface,
            justifyContent: 'center',
            alignItems: 'center',
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.surfaceContainerLow,
            zIndex: 10,
            flexDirection: 'row',
        },
        newButton: {
            position: 'absolute',
            right: 16,
        },
        menuButton: {
            position: 'absolute',
            left: 16,
        },
        messagesContainer: {
            flex: 1,
            backgroundColor: theme.colors.surface,
        },
        messagesList: {
            paddingHorizontal: 4,
            paddingVertical: 16,
            flexGrow: 1,
        },
        messageRow: {
            flexDirection: 'row',
            alignItems: 'center',
            marginVertical: 4,
        },
        botMessageRow: {
            justifyContent: 'flex-start',
        },
        userMessageRow: {
            justifyContent: 'flex-end',
        },
        messageContainer: {
            maxWidth: '80%',
            padding: 12,
            borderRadius: 16,
        },
        avatarContainer: {
            marginHorizontal: 8,
        },
        avatar: {
            width: 32,
            height: 32,
            borderRadius: 16,
            justifyContent: 'center',
            alignItems: 'center',
        },
        botAvatar: {
            backgroundColor: theme.colors.secondary,
        },
        userAvatar: {
            backgroundColor: theme.colors.secondary,
        },
        avatarText: {
            color: theme.colors.onSecondary,
            fontSize: 14,
            fontWeight: 'bold',
        },
        botMessage: {
            backgroundColor: theme.colors.inverseOnSurface,
            alignSelf: 'flex-start',
            borderBottomLeftRadius: 4,
        },
        userMessage: {
            backgroundColor: theme.colors.primary,
            alignSelf: 'flex-end',
            borderBottomRightRadius: 4,
        },
        inputContainer: {
            flexDirection: 'row',
            padding: 16,
            backgroundColor: theme.colors.background,
            borderTopWidth: 1,
            borderTopColor: theme.colors.surfaceContainerLow,
        },
        input: {
            flex: 1,
            backgroundColor: theme.colors.secondaryContainer,
            borderRadius: 20,
            paddingHorizontal: 16,
            paddingVertical: 8,
            marginRight: 8,
            fontSize: 16,
            maxHeight: 100,
        },
        sendButton: {
            backgroundColor: theme.colors.primary,
            color: theme.colors.onPrimary,
            borderRadius: 20,
            paddingHorizontal: 20,
            justifyContent: 'center',
            alignItems: 'center',
        },
        cancelButton: {
            backgroundColor: theme.colors.error,
        },
        sendButtonText: {
            color: theme.colors.onPrimary,
            fontSize: 16,
        },
        text: {
            color: theme.colors.onSurface
        },
        thinkContainer: {
            marginVertical: 8,
            borderRadius: 4,
            overflow: 'hidden'
        },
        thinkIndicator: {
            width: 4,
            backgroundColor: theme.colors.onPrimary,
            marginRight: 8
        },
    });

    return (
        <View style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                {/* Fixed Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.menuButton}
                        onPress={() => {navigation.openDrawer()}}>
                        <Icon name="menu" size={24} color={theme.colors.onSurface} />
                    </TouchableOpacity>
                    <ModelSelector
                        currentModel={selectedModel}
                        onModelSelect={handleModelSelect}
                    />
                    <TouchableOpacity
                        style={styles.newButton}
                        onPress={handleNewPress}>
                        <Icon name="add-comment" size={24} color={theme.colors.onSurface} />
                    </TouchableOpacity>
                </View>

                {/* Scrollable Message Area */}
                <View style={styles.messagesContainer}>
                    <FlatList
                        ref={flatListRef}
                        data={messagesRef.current}
                        renderItem={renderMessage}
                        contentContainerStyle={styles.messagesList}
                        showsVerticalScrollIndicator={true}
                        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                    />
                </View>

                {/* Fixed Input Bar */}
                <KeyboardAvoidingView
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.input}
                            value={message}
                            onChangeText={setMessage}
                            placeholder={t('typeMessage')}
                            multiline
                            editable={!chatting}
                        />
                        <TouchableOpacity
                            style={[styles.sendButton, chatting && styles.cancelButton]}
                            onPress={handleSend}>
                            <Text style={styles.sendButtonText}>
                                {chatting ? t('cancel') : t('send')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>

                <Portal>
                    <Dialog visible={loadingModalVisible}>
                        <Dialog.Title>{t('waiting')}</Dialog.Title>
                        <Dialog.Content>
                            <View style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                            }}>
                                <Text style={[styles.text, { flex: 1 }]}>
                                    {t('loadingModel')} {selectedModel}...
                                </Text>
                                <ActivityIndicator
                                    animating={true}
                                    color={theme.colors.primary}
                                    size={'large'}
                                />
                            </View>
                        </Dialog.Content>
                    </Dialog>
                </Portal>
            </SafeAreaView>
        </View>
    );
};

export default HomePage;
