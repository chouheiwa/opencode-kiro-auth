# opencode-kiro-auth

OpenCode authentication plugin for AWS Kiro (CodeWhisperer) providing access to Claude models through dual OAuth methods.

## Features

- Dual authentication: Google OAuth (Social) and AWS OIDC (Builder ID)
- Multi-account management with automatic rotation
- Proactive token refresh in background
- Session recovery on errors
- Rate limit handling with exponential backoff
- Usage tracking and quota monitoring
- Thinking mode support (configurable)
- Streaming and non-streaming responses

## Installation

### Prerequisites

- Node.js >= 20.0.0
- OpenCode CLI installed

### Install Plugin

```bash
npm install opencode-kiro-auth
```

Or from source:

```bash
git clone <repository-url>
cd opencode-kiro-auth
npm install
npm run build
npm link
```

### Configure OpenCode

Add plugin and models to `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-kiro-auth"],
  "provider": {
    "kiro": {
      "models": {
        "kiro-claude-opus-4-5": {
          "name": "Claude Opus 4.5 (Kiro)",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "kiro-claude-opus-4-5-thinking": {
          "name": "Claude Opus 4.5 Thinking (Kiro)",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image"], "output": ["text"] },
          "variants": {
            "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
            "medium": { "thinkingConfig": { "thinkingBudget": 16384 } },
            "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
          }
        },
        "kiro-claude-sonnet-4-5": {
          "name": "Claude Sonnet 4.5 (Kiro)",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "kiro-claude-sonnet-4-5-thinking": {
          "name": "Claude Sonnet 4.5 Thinking (Kiro)",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image"], "output": ["text"] },
          "variants": {
            "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
            "medium": { "thinkingConfig": { "thinkingBudget": 16384 } },
            "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
          }
        },
        "kiro-claude-haiku-4-5": {
          "name": "Claude Haiku 4.5 (Kiro)",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        }
      }
    }
  }
}
```

## Authentication

### Method 1: Google OAuth (Social)

```bash
opencode auth login
```

Select "Google OAuth (Social)" and follow browser prompts.

### Method 2: AWS Builder ID (IDC)

```bash
opencode auth login
```

Select "AWS Builder ID (IDC)" and complete AWS OIDC flow.

### Multiple Accounts

Add multiple accounts for automatic rotation:

```bash
opencode auth login  # First account
opencode auth login  # Second account
```

## Model Variants

The plugin supports OpenCode's variant system for dynamic thinking configuration. Define variants in your model config:

```json
{
  "kiro-claude-opus-4-5-thinking": {
    "name": "Claude Opus 4.5 Thinking",
    "variants": {
      "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
      "medium": { "thinkingConfig": { "thinkingBudget": 16384 } },
      "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
    }
  }
}
```

Usage:
```bash
opencode chat "Solve this problem" --model=kiro/kiro-claude-opus-4-5-thinking --variant=max
```

## Configuration

Optional: Create `~/.config/opencode/kiro.json` or `.opencode/kiro.json`:

```json
{
  "account_selection_strategy": "sticky",
  "proactive_token_refresh": true,
  "session_recovery": true,
  "default_region": "us-east-1"
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `thinking_enabled` | boolean | false | Fallback if no variant specified |
| `thinking_budget_tokens` | number | 20000 | Fallback thinking budget |
| `account_selection_strategy` | string | "sticky" | "sticky" or "round-robin" |
| `proactive_token_refresh` | boolean | true | Background token refresh |
| `session_recovery` | boolean | true | Auto-recover from errors |
| `auto_resume` | boolean | true | Auto-resume failed sessions |
| `default_region` | string | "us-east-1" | AWS region |
| `rate_limit_max_retries` | number | 3 | Max retry attempts |
| `quota_warning_threshold` | number | 0.8 | Quota warning (0-1) |

**Note:** Thinking configuration from model variants takes priority over config file settings.

### Environment Variables

```bash
export KIRO_DEBUG=true
export KIRO_THINKING_ENABLED=true
export KIRO_DEFAULT_REGION=us-west-2
export KIRO_ACCOUNT_SELECTION_STRATEGY=round-robin
```

## Supported Models

The plugin supports all Claude models available through Kiro. Define them in your `opencode.json`:

**Recommended Model Names:**
- `kiro-claude-opus-4-5` - Claude Opus 4.5 (no thinking)
- `kiro-claude-opus-4-5-thinking` - Claude Opus 4.5 with thinking variants
- `kiro-claude-sonnet-4-5` - Claude Sonnet 4.5 (no thinking)
- `kiro-claude-sonnet-4-5-thinking` - Claude Sonnet 4.5 with thinking variants
- `kiro-claude-haiku-4-5` - Claude Haiku 4.5

**Internal Model Mapping:**
- claude-opus-4-5 → claude-opus-4.5
- claude-sonnet-4-5 → CLAUDE_SONNET_4_5_20250929_V1_0
- claude-haiku-4-5 → claude-haiku-4.5
- claude-sonnet-4-20250514 → CLAUDE_SONNET_4_20250514_V1_0
- claude-3-7-sonnet-20250219 → CLAUDE_3_7_SONNET_20250219_V1_0

## Usage

Once configured, use OpenCode normally:

```bash
opencode chat "Explain quantum computing"
```

The plugin handles authentication, token refresh, and account rotation automatically.

## Storage Locations

- Accounts: `~/.config/opencode/kiro-accounts.json`
- Recovery state: `~/.config/opencode/kiro-recovery.json`
- Configuration: `~/.config/opencode/kiro.json` or `.opencode/kiro.json`

## Troubleshooting

### Token Expired

Tokens refresh automatically. If issues persist:

```bash
opencode auth logout
opencode auth login
```

### Rate Limited

The plugin handles rate limits automatically with exponential backoff and account rotation.

### Quota Exhausted

When quota is exhausted, the plugin marks the account unhealthy and switches to another account. Quota resets on the 1st of each month.

### Debug Mode

Enable debug logging:

```bash
export KIRO_DEBUG=true
opencode chat "test"
```

## Architecture

The plugin uses a layered architecture:

1. Authentication Layer - Dual OAuth (Social + IDC)
2. Request Transformation - OpenAI to CodeWhisperer format
3. Response Parsing - AWS Event Stream to Claude SSE format
4. Account Management - Multi-account rotation with health tracking
5. Error Handling - Retry logic with exponential backoff
6. Configuration - Zod-based validation with env overrides

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## Development

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

## Limitations

- AWS SSO OIDC refresh tokens are single-use
- Requires valid Kiro/CodeWhisperer credentials
- Subject to AWS rate limits and quotas
- Educational purposes only

## Disclaimer

This plugin is provided for educational and learning purposes only. It is not officially affiliated with, endorsed by, or supported by Amazon Web Services (AWS), Anthropic, or OpenCode. Use at your own risk.

The authors and contributors are not responsible for:
- Any violations of terms of service
- Account suspensions or bans
- Data loss or corruption
- Any other damages or issues arising from use

Users are responsible for ensuring their use complies with all applicable terms of service and laws.

## License

MIT

## Contributing

Contributions are welcome for educational purposes. Please open an issue or pull request.

## Support

For issues and questions, please open a GitHub issue.
