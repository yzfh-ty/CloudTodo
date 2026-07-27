export type NotificationDeliveryKind = 'wecom_robot' | 'standard_webhook';

const WECOM_ROBOT_HOST = 'qyapi.weixin.qq.com';
const WECOM_ROBOT_PATH = '/cgi-bin/webhook/send';

/**
 * The WeCom branch signs only "{timestamp}\n{secret}" as a query parameter and
 * therefore drops the request-body HMAC, so misclassifying a target is a
 * signature-stripping primitive. Classification is done on the parsed host and
 * path: a substring test also matched the query string, letting any URL opt out
 * of body signing by carrying the marker in a parameter.
 */
export function inferNotificationDeliveryKind(targetUrl: string): NotificationDeliveryKind {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return 'standard_webhook';
  }

  return url.hostname.toLowerCase() === WECOM_ROBOT_HOST &&
    url.pathname.toLowerCase() === WECOM_ROBOT_PATH
    ? 'wecom_robot'
    : 'standard_webhook';
}

export function defaultPayloadTemplate(kind: NotificationDeliveryKind): string {
  if (kind === 'wecom_robot') {
    return JSON.stringify(
      {
        msgtype: 'text',
        text: {
          content: [
            'CloudTodo 提醒通知',
            '任务：{{todo_title}}',
            '状态：{{todo_status}}',
            '优先级：{{todo_priority}}',
            '提醒时间：{{scheduled_for}}',
            '触发时间：{{triggered_at}}',
            '补充信息：{{payload_text}}',
          ].join('\n'),
        },
      },
      null,
      2,
    );
  }

  return JSON.stringify(
    {
      source: 'cloudtodo',
      endpoint_id: '{{endpoint_id}}',
      endpoint_name: '{{endpoint_name}}',
      delivery_id: '{{delivery_id}}',
      reminder_event_id: '{{reminder_event_id}}',
      channel: '{{channel}}',
      scheduled_for: '{{scheduled_for}}',
      triggered_at: '{{triggered_at}}',
      user: {
        id: '{{user_id}}',
        timezone: '{{user_timezone}}',
      },
      payload: '{{payload_json}}',
    },
      null,
      2,
    ).replace('"{{payload_json}}"', '{{payload_json}}');
}

export function renderPayloadTemplate(
  template: string,
  variables: Record<string, unknown>,
): string {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key: string) => {
    const value = variables[key];

    // Only `_json` variables are substituted raw, and only because they are
    // produced by JSON.stringify. Everything else lands inside a JSON string
    // literal in the template and must be escaped, including `_text`, whose
    // values are user-controlled task titles and descriptions.
    if (key.endsWith('_json')) {
      return JSON.stringify(value ?? null);
    }

    return escapeJsonString(stringifyTextValue(value));
  });
}

function stringifyTextValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

function escapeJsonString(value: string): string {
  // JSON.stringify handles every escape RFC 8259 requires — the full
  // U+0000-U+001F range, not just \n \r \t — so borrow it and drop the quotes
  // it wraps the result in.
  const quoted = JSON.stringify(value);
  return quoted.slice(1, -1);
}
