# answerWidgetQuery

> Part of the [Telegram Bot API](/bots/api.md). Canonical location: [answerWidgetQuery](/bots/api#answerwidgetquery).

Use this method to send an answer to a query from a widget. The query must be answered within 15 seconds. The answer is received only by the widget that sent the query and doesn't change data of the widget; use [editMessageWidgetData](/bots/api/methods/editmessagewidgetdata.md) or [editSharedWidgetData](/bots/api/methods/editsharedwidgetdata.md) to change it. On success, *True* is returned.

|Parameter|Type|Required|Description|
|-----------|
|widget_query_id|String|Yes|Unique identifier for the query to be answered|
|data|String|Optional|Data to be returned to the widget, 0-1024 bytes|
# editMessageWidgetData

> Part of the [Telegram Bot API](/bots/api.md). Canonical location: [editMessageWidgetData](/bots/api#editmessagewidgetdata).

Use this method to edit data of a widget in a message sent by the bot or via the bot (for inline bots). Public data of a shared widget can be changed at most once per second. On success, *True* is returned.

|Parameter|Type|Required|Description|
|-----------|
|chat_id|Integer or String|Optional|Required if *inline_message_id* is not specified. Unique identifier for the target chat or username of the target supergroup in the format `@username`.|
|message_id|Integer|Optional|Required if *inline_message_id* is not specified. Identifier of the message with the widget.|
|inline_message_id|String|Optional|Required if *chat_id* and *message_id* are not specified. Identifier of the inline message.|
|public_data|String|Optional|New public data of the widget, 0-1024 bytes; pass an empty string to remove the public data. If omitted, then the public data isn't changed.|
|chat_data|String|Optional|New data of the widget, which is specific to the message, 0-1024 bytes; pass an empty string to remove the data. If omitted, then the data isn't changed.|
# editSharedWidgetData

> Part of the [Telegram Bot API](/bots/api.md). Canonical location: [editSharedWidgetData](/bots/api#editsharedwidgetdata).

Use this method to edit public data of a shared widget created by the bot. A shared widget can be edited at most once per second. On success, *True* is returned.

|Parameter|Type|Required|Description|
|-----------|
|widget_id|String|Yes|Unique identifier of the shared widget|
|public_data|String|Yes|New public data of the widget, 0-1024 bytes; pass an empty string to remove the public data|
|cache_time|Integer|Optional|The maximum amount of time in seconds that the public data of the widget may be cached client-side; 5-3600. If omitted, then the current value is kept, which is 30 by default.|
# sendSharedWidget

> Part of the [Telegram Bot API](/bots/api.md). Canonical location: [sendSharedWidget](/bots/api#sendsharedwidget).

Use this method to send again a shared widget created by the bot. Currently, in the production environment, widgets can be sent only to private chats, and sent widgets automatically have protected content and therefore can't be forwarded. On success, the sent [Message](/bots/api/types/message.md) is returned.

|Parameter|Type|Required|Description|
|-----------|
|chat_id|Integer or String|Yes|Unique identifier for the target chat or username of the target supergroup in the format `@username`|
|message_thread_id|Integer|Optional|Unique identifier for the target message thread (topic) of a forum; for forum supergroups and private chats of bots with forum topic mode enabled only|
|widget_id|String|Yes|Unique identifier of the shared widget|
|chat_data|String|Optional|Data of the widget, which is specific to the message, 0-1024 bytes|
|caption|String|Optional|Widget caption, 0-1024 characters after entities parsing|
|parse_mode|String|Optional|Mode for parsing entities in the widget caption. See [formatting options](/bots/api/formatting.md) for more details.|
|caption_entities|Array of [MessageEntity](/bots/api/types/messageentity.md)|Optional|A JSON-serialized list of special entities that appear in the caption, which can be specified instead of *parse_mode*|
|show_caption_above_media|Boolean|Optional|Pass *True* if the caption must be shown above the widget|
|disable_notification|Boolean|Optional|Sends the message [silently](https://telegram.org/blog/channels-2-0#silent-messages). Users will receive a notification with no sound.|
|protect_content|Boolean|Optional|Protects the contents of the sent message from forwarding and saving|
|allow_paid_broadcast|Boolean|Optional|Pass *True* to allow up to 1000 messages per second, ignoring [broadcasting limits](/bots/faq.md#how-can-i-message-all-of-my-bot-39s-subscribers-at-once) for a fee of 0.1 Telegram Stars per message. The relevant Stars will be withdrawn from the bot's balance.|
|message_effect_id|String|Optional|Unique identifier of the message effect to be added to the message; for private chats only|
|reply_parameters|[ReplyParameters](/bots/api/types/replyparameters.md)|Optional|Description of the message to reply to|
|reply_markup|[InlineKeyboardMarkup](/bots/api/types/inlinekeyboardmarkup.md) or [ReplyKeyboardMarkup](/bots/api/types/replykeyboardmarkup.md) or [ReplyKeyboardRemove](/bots/api/types/replykeyboardremove.md) or [ForceReply](/bots/api/types/forcereply.md)|Optional|Additional interface options. A JSON-serialized object for an [inline keyboard](/bots/features.md#inline-keyboards), [custom reply keyboard](/bots/features.md#keyboards), instructions to remove a reply keyboard or to force a reply from the user.|
# sendWidget

> Part of the [Telegram Bot API](/bots/api.md). Canonical location: [sendWidget](/bots/api#sendwidget).

Use this method to send a message with an [HTML widget](/bots/widgets.md). Currently, in the production environment, widgets can be sent only to private chats, and sent widgets automatically have protected content and therefore can't be forwarded. On success, the sent [Message](/bots/api/types/message.md) is returned.

|Parameter|Type|Required|Description|
|-----------|
|chat_id|Integer or String|Yes|Unique identifier for the target chat or username of the target supergroup in the format `@username`|
|message_thread_id|Integer|Optional|Unique identifier for the target message thread (topic) of a forum; for forum supergroups and private chats of bots with forum topic mode enabled only|
|html|String|Yes|HTML code of the widget, 1-32768 bytes. The code must not exceed 4096 bytes when compressed by zlib with the maximum compression level.|
|width|Integer|Optional|Width of the widget in logical pixels; omit if the widget must occupy the whole width of the message bubble. The width is clamped by the app to the range from 200 to the maximum width of the message bubble.|
|height|Integer|Optional|Height of the widget in logical pixels; omit if the height of the widget isn't fixed. The height is clamped by the app to the range 50-600.|
|public_data|String|Optional|Public data of the widget, 0-1024 bytes, which will be available wherever the widget is shown. If the widget is shared, then all messages with it will have the same public data.|
|chat_data|String|Optional|Data of the widget, which is specific to the message, 0-1024 bytes|
|caption|String|Optional|Widget caption, 0-1024 characters after entities parsing|
|parse_mode|String|Optional|Mode for parsing entities in the widget caption. See [formatting options](/bots/api/formatting.md) for more details.|
|caption_entities|Array of [MessageEntity](/bots/api/types/messageentity.md)|Optional|A JSON-serialized list of special entities that appear in the caption, which can be specified instead of *parse_mode*|
|show_caption_above_media|Boolean|Optional|Pass *True* if the caption must be shown above the widget|
|allow_queries|Boolean|Optional|Pass *True* to allow the widget to send queries to the bot|
|is_shared|Boolean|Optional|Pass *True* to create a shared widget, which can be sent again using the method [sendSharedWidget](/bots/api/methods/sendsharedwidget.md)|
|disable_notification|Boolean|Optional|Sends the message [silently](https://telegram.org/blog/channels-2-0#silent-messages). Users will receive a notification with no sound.|
|protect_content|Boolean|Optional|Protects the contents of the sent message from forwarding and saving|
|allow_paid_broadcast|Boolean|Optional|Pass *True* to allow up to 1000 messages per second, ignoring [broadcasting limits](/bots/faq.md#how-can-i-message-all-of-my-bot-39s-subscribers-at-once) for a fee of 0.1 Telegram Stars per message. The relevant Stars will be withdrawn from the bot's balance.|
|message_effect_id|String|Optional|Unique identifier of the message effect to be added to the message; for private chats only|
|reply_parameters|[ReplyParameters](/bots/api/types/replyparameters.md)|Optional|Description of the message to reply to|
|reply_markup|[InlineKeyboardMarkup](/bots/api/types/inlinekeyboardmarkup.md) or [ReplyKeyboardMarkup](/bots/api/types/replykeyboardmarkup.md) or [ReplyKeyboardRemove](/bots/api/types/replykeyboardremove.md) or [ForceReply](/bots/api/types/forcereply.md)|Optional|Additional interface options. A JSON-serialized object for an [inline keyboard](/bots/features.md#inline-keyboards), [custom reply keyboard](/bots/features.md#keyboards), instructions to remove a reply keyboard or to force a reply from the user.|
# InputSharedWidgetMessageContent

> Part of the [Telegram Bot API](/bots/api.md). Canonical location: [InputSharedWidgetMessageContent](/bots/api#inputsharedwidgetmessagecontent).

Represents the [content](/bots/api/types/inputmessagecontent.md) of a message with a shared widget to be sent as the result of an inline query. Currently, widgets can't be sent in response to inline queries in the production environment.

|Field|Type|Description|
|-----------|
|widget_id|String|Unique identifier of the shared widget created by the bot|
|chat_data|String|*Optional*. Data of the widget, which is specific to the message, 0-1024 bytes|
|caption|String|*Optional*. Widget caption, 0-1024 characters after entities parsing|
|parse_mode|String|*Optional*. Mode for parsing entities in the widget caption. See [formatting options](/bots/api/formatting.md) for more details.|
|caption_entities|Array of [MessageEntity](/bots/api/types/messageentity.md)|*Optional*. List of special entities that appear in the caption, which can be specified instead of *parse_mode*|
|show_caption_above_media|Boolean|*Optional*. Pass *True* if the caption must be shown above the widget|
# SharedWidgetQuery

> Part of the [Telegram Bot API](/bots/api.md). Canonical location: [SharedWidgetQuery](/bots/api#sharedwidgetquery).

This object represents an incoming query from a forwarded message with a shared widget created by the bot. Use [answerWidgetQuery](/bots/api/methods/answerwidgetquery.md) to answer the query. Each user can send at most 5 queries per 5 seconds to the bot from all its widgets.

|Field|Type|Description|
|-----------|
|id|String|Unique identifier for this query|
|from|[User](/bots/api/types/user.md)|Sender|
|type|[WidgetQueryType](/bots/api/types/widgetquerytype.md)|Type of the query|
|data|String|Data of the query, 1-64 bytes|
|widget_id|String|Unique identifier of the shared widget, which sent the query|
# Widget

> Part of the [Telegram Bot API](/bots/api.md). Canonical location: [Widget](/bots/api#widget).

This object describes an [HTML widget](/bots/widgets.md).

|Field|Type|Description|
|-----------|
|id|String|*Optional*. Unique identifier of the shared widget, which can be used to send the widget again using the method [sendSharedWidget](/bots/api/methods/sendsharedwidget.md); omitted if the widget isn't shared|
|width|Integer|*Optional*. Width of the widget in logical pixels; omitted if the widget must occupy the whole width of the message bubble|
|height|Integer|*Optional*. Height of the widget in logical pixels; omitted if the height of the widget isn't fixed|
|html|String|HTML code of the widget|
|public_data|String|*Optional*. Public data of the widget, which is available wherever the widget is shown. All messages with a shared widget have the same public data.|
|chat_data|String|*Optional*. Data of the widget, which is specific to the message|
# WidgetQuery

> Part of the [Telegram Bot API](/bots/api.md). Canonical location: [WidgetQuery](/bots/api#widgetquery).

This object represents an incoming query from a widget in a message sent by the bot or via the bot. Use [answerWidgetQuery](/bots/api/methods/answerwidgetquery.md) to answer the query. Each user can send at most 5 queries per 5 seconds to the bot from all its widgets.

|Field|Type|Description|
|-----------|
|id|String|Unique identifier for this query|
|from|[User](/bots/api/types/user.md)|Sender|
|chat|[Chat](/bots/api/types/chat.md)|*Optional*. Chat with the message containing the widget; omitted if the widget is in an inline message|
|message_id|Integer|*Optional*. Identifier of the message containing the widget; omitted if the widget is in an inline message|
|inline_message_id|String|*Optional*. Identifier of the inline message containing the widget|
|chat_instance|String|Global identifier, uniquely corresponding to the chat to which the message with the widget was sent|
|chat_type|String|*Optional*. For widgets in inline messages, type of the chat to which the message was sent. Can be either "sender" for a private chat with the inline query sender, "private", "group", "supergroup", or "channel".|
|type|[WidgetQueryType](/bots/api/types/widgetquerytype.md)|Type of the query|
|data|String|Data of the query, 1-64 bytes|
|widget_id|String|*Optional*. Unique identifier of the shared widget, which sent the query; omitted if the widget isn't shared|
# WidgetQueryType

> Part of the [Telegram Bot API](/bots/api.md). Canonical location: [WidgetQueryType](/bots/api#widgetquerytype).

This object describes the type of a query from a widget. Currently, it can be one of

* [WidgetQueryTypeData](/bots/api/types/widgetquerytypedata.md)
* [WidgetQueryTypeSignData](/bots/api/types/widgetquerytypesigndata.md)
* [WidgetQueryTypeSentTransaction](/bots/api/types/widgetquerytypesenttransaction.md)
# WidgetQueryTypeData

> Part of the [Telegram Bot API](/bots/api.md). Canonical location: [WidgetQueryTypeData](/bots/api#widgetquerytypedata).

The query contains data for the bot.

|Field|Type|Description|
|-----------|
|type|String|Type of the query, always "data"|
|wallet_card|[TonWalletCard](/bots/api/types/tonwalletcard.md)|*Optional*. TON wallet card of the user who sent the query, if it was sent to the bot along with the query|
