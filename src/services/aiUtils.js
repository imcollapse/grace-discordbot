// dev: cosmin | module: aiUtils

const config = require('../settings');
const { filterMentions } = require('./mentionFilter');
const { saveMessage, getHistory } = require('../database/aiHistory');

const SYSTEM_PROMPT = config.AI_PROMPTS.SYSTEM_PROMPT;
const CASUAL_PROMPT = config.AI_PROMPTS.CASUAL_PROMPT;

const provider = require('./aiProvider');

// Kept for older callers (guardAI, channel auto-reply): same shape as before, now served by the free provider.
const getApiKeys = () => [];

const makeApiRequest = async (messages, options = {}) => {
    const r = await provider.chat(messages, {
        maxTokens: options.maxTokens || 2048,
        temperature: options.temperature ?? 0.6,
        fast: !!options.fast,
    });
    return r.success ? { success: true, content: r.content, model: r.model, label: r.label, host: r.host, ms: r.ms } : { success: false, error: r.error };
};

const buildMessagesWithHistory = async (userId, channelId, guildId, userMessage, systemPrompt, includeHistory = true) => {
    const messages = [
        { role: 'system', content: systemPrompt }
    ];
    
    if (includeHistory) {
        const history = await getHistory(userId, channelId, guildId);
        
        const recentHistory = history.slice(-10);
        
        for (const msg of recentHistory) {
            messages.push({
                role: msg.role,
                content: msg.content
            });
        }
    }
    
    messages.push({
        role: 'user',
        content: userMessage
    });
    
    return messages;
};

const processAiResponse = (response) => {
    if (!response) return 'I couldn\'t process that request.';
    
    let processed = response;
    
    const mentionCheck = filterMentions(processed);
    if (mentionCheck.filtered) {
        processed = mentionCheck.response;
    }
    
    const modelPatterns = [
        /\b(GPT-?\d*|ChatGPT|OpenAI|Claude|Anthropic|Gemini|Google AI|Meta AI|Llama|Mixtral|Pollinations)\b/gi,
        /I('m| am) (a |an )?(GPT|Claude|Gemini|Llama|language model|large language model|LLM)/gi,
        /developed by (OpenAI|Anthropic|Google|Meta)/gi,
        /trained by (OpenAI|Anthropic|Google|Meta)/gi
    ];
    
    for (const pattern of modelPatterns) {
        processed = processed.replace(pattern, (match) => {
            if (new RegExp(config.BOT_NAME, 'i').test(match)) return match;
            return config.BOT_NAME;
        });
    }
    
    return processed;
};

const splitMessage = (content, maxLength = 1950) => {
    if (content.length <= maxLength) {
        return [content];
    }
    
    const chunks = [];
    let remaining = content;
    
    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining);
            break;
        }
        
        let splitIndex = remaining.lastIndexOf('\n\n', maxLength);
        if (splitIndex === -1 || splitIndex < maxLength * 0.3) {
            splitIndex = remaining.lastIndexOf('\n', maxLength);
        }
        if (splitIndex === -1 || splitIndex < maxLength * 0.3) {
            splitIndex = remaining.lastIndexOf('. ', maxLength);
            if (splitIndex !== -1) splitIndex++;
        }
        if (splitIndex === -1 || splitIndex < maxLength * 0.3) {
            splitIndex = remaining.lastIndexOf(' ', maxLength);
        }
        if (splitIndex === -1 || splitIndex < maxLength * 0.3) {
            splitIndex = maxLength;
        }
        
        chunks.push(remaining.substring(0, splitIndex).trim());
        remaining = remaining.substring(splitIndex).trim();
    }
    
    return chunks;
};

const generateAiResponse = async (options) => {
    const {
        userId,
        channelId,
        guildId,
        prompt,
        systemPrompt = SYSTEM_PROMPT,
        includeHistory = true,
        saveToHistory = true,
        maxTokens = 2048
    } = options;
    
    const messages = await buildMessagesWithHistory(
        userId,
        channelId,
        guildId,
        prompt,
        systemPrompt,
        includeHistory
    );
    
    const result = await makeApiRequest(messages, { maxTokens });
    
    if (!result.success) {
        return {
            success: false,
            error: result.error
        };
    }
    
    const processedContent = processAiResponse(result.content);
    
    if (saveToHistory && channelId && guildId) {
        try {
            saveMessage(guildId, channelId, userId, 'user', prompt);
            saveMessage(guildId, channelId, userId, 'assistant', processedContent);
        } catch (err) {
            console.error('[AI] Error saving to history:', err.message);
        }
    }
    
    return {
        success: true,
        content: processedContent,
        model: result.label ? `${result.label}` : result.model,
        host: result.host,
        ms: result.ms,
        chunks: splitMessage(processedContent)
    };
};

const hasApiKey = () => provider.hasChat();

module.exports = {
    SYSTEM_PROMPT,
    CASUAL_PROMPT,
    generateAiResponse,
    splitMessage,
    processAiResponse,
    makeApiRequest,
    hasApiKey,
    getApiKeys
};
