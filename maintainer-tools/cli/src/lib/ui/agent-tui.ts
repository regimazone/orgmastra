import blessed from 'blessed';
import chalk from 'chalk';
import { EventEmitter } from 'events';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface AgentTUIOptions {
  issueNumber: number;
  issueTitle: string;
  projectPath: string;
}

export class AgentTUI extends EventEmitter {
  private screen: blessed.Widgets.Screen;
  private chatBox: blessed.Widgets.BoxElement;
  private filesBox: blessed.Widgets.BoxElement;
  private outputBox: blessed.Widgets.BoxElement;
  private inputBox: blessed.Widgets.TextboxElement;
  private statusBar: blessed.Widgets.BoxElement;
  private messages: ChatMessage[] = [];
  private currentFiles: string[] = [];

  constructor(private options: AgentTUIOptions) {
    super();
    this.screen = this.createScreen();
    this.createLayout();
    this.setupEventHandlers();
    this.addWelcomeMessage();
  }

  private createScreen(): blessed.Widgets.Screen {
    return blessed.screen({
      smartCSR: true,
      title: `Debugging Issue #${this.options.issueNumber}`,
      fullUnicode: true,
    });
  }

  private createLayout(): void {
    // Main chat area
    this.chatBox = blessed.box({
      label: ' Chat ',
      top: 0,
      left: 0,
      width: '60%',
      height: '70%',
      border: { type: 'line' },
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      vi: true,
      style: {
        fg: 'white',
        border: { fg: 'cyan' },
        label: { fg: 'cyan', bold: true },
      },
    });

    // Files explorer
    this.filesBox = blessed.list({
      label: ' Files ',
      top: 0,
      right: 0,
      width: '40%',
      height: '50%',
      border: { type: 'line' },
      scrollable: true,
      mouse: true,
      keys: true,
      vi: true,
      style: {
        fg: 'white',
        border: { fg: 'green' },
        label: { fg: 'green', bold: true },
        selected: { bg: 'blue' },
      },
    });

    // Command output
    this.outputBox = blessed.log({
      label: ' Output ',
      top: '50%',
      right: 0,
      width: '40%',
      height: '20%',
      border: { type: 'line' },
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      style: {
        fg: 'white',
        border: { fg: 'yellow' },
        label: { fg: 'yellow', bold: true },
      },
    });

    // Input area
    this.inputBox = blessed.textbox({
      label: ' Input (Press Enter to send, Esc to cancel) ',
      bottom: 3,
      left: 0,
      width: '100%',
      height: 3,
      border: { type: 'line' },
      inputOnFocus: true,
      mouse: true,
      keys: true,
      style: {
        fg: 'white',
        border: { fg: 'magenta' },
        label: { fg: 'magenta', bold: true },
      },
    });

    // Status bar
    this.statusBar = blessed.box({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      style: {
        fg: 'black',
        bg: 'white',
      },
    });

    // Add all components
    this.screen.append(this.chatBox);
    this.screen.append(this.filesBox);
    this.screen.append(this.outputBox);
    this.screen.append(this.inputBox);
    this.screen.append(this.statusBar);

    this.updateStatusBar('Ready');
  }

  private setupEventHandlers(): void {
    // Input handling
    this.inputBox.on('submit', (text) => {
      if (text.trim()) {
        this.handleUserInput(text.trim());
      }
      this.inputBox.clearValue();
      this.inputBox.focus();
      this.screen.render();
    });

    this.inputBox.on('cancel', () => {
      this.inputBox.clearValue();
      this.inputBox.focus();
      this.screen.render();
    });

    // File selection
    this.filesBox.on('select', (item) => {
      const filename = item.getText();
      this.emit('file-selected', filename);
    });

    // Global keys
    this.screen.key(['escape', 'q', 'C-c'], () => {
      this.emit('quit');
      return process.exit(0);
    });

    this.screen.key(['C-l'], () => {
      this.clearChat();
    });

    this.screen.key(['C-f'], () => {
      this.filesBox.focus();
    });

    this.screen.key(['C-o'], () => {
      this.outputBox.focus();
    });

    this.screen.key(['C-i'], () => {
      this.inputBox.focus();
    });

    // Focus input by default
    this.inputBox.focus();
  }

  private addWelcomeMessage(): void {
    this.addMessage('system', chalk.bold.cyan('🤖 Debug Agent'));
    this.addMessage('system', `I'm here to help debug issue #${this.options.issueNumber}: ${this.options.issueTitle}\n`);
    this.addMessage('system', 'Available commands:');
    this.addMessage('system', '  /help      - Show available commands');
    this.addMessage('system', '  /files     - Browse project files');
    this.addMessage('system', '  /run <cmd> - Run a command');
    this.addMessage('system', '  /read <file> - Read a file');
    this.addMessage('system', '  /search <pattern> - Search for code');
    this.addMessage('system', '  /clear     - Clear chat (or Ctrl+L)');
    this.addMessage('system', '  /quit      - Exit debugger\n');
    this.addMessage('system', 'Shortcuts: Ctrl+F (files), Ctrl+O (output), Ctrl+I (input)\n');
  }

  private handleUserInput(text: string): void {
    this.addMessage('user', text);

    if (text.startsWith('/')) {
      this.handleCommand(text);
    } else {
      this.emit('message', text);
    }
  }

  private handleCommand(command: string): void {
    const [cmd, ...args] = command.split(' ');
    const arg = args.join(' ');

    switch (cmd) {
      case '/help':
        this.showHelp();
        break;
      case '/clear':
        this.clearChat();
        break;
      case '/quit':
        this.emit('quit');
        process.exit(0);
        break;
      case '/files':
        this.emit('browse-files');
        break;
      case '/run':
        if (arg) {
          this.emit('run-command', arg);
        } else {
          this.addMessage('system', chalk.red('Usage: /run <command>'));
        }
        break;
      case '/read':
        if (arg) {
          this.emit('read-file', arg);
        } else {
          this.addMessage('system', chalk.red('Usage: /read <file>'));
        }
        break;
      case '/search':
        if (arg) {
          this.emit('search-code', arg);
        } else {
          this.addMessage('system', chalk.red('Usage: /search <pattern>'));
        }
        break;
      default:
        this.addMessage('system', chalk.red(`Unknown command: ${cmd}`));
    }
  }

  private showHelp(): void {
    this.addMessage('system', '\n' + chalk.bold('Available commands:'));
    this.addMessage('system', '  /help      - Show this help');
    this.addMessage('system', '  /files     - Browse project files');
    this.addMessage('system', '  /run <cmd> - Run a command');
    this.addMessage('system', '  /read <file> - Read a file');
    this.addMessage('system', '  /search <pattern> - Search for code patterns');
    this.addMessage('system', '  /clear     - Clear chat history');
    this.addMessage('system', '  /quit      - Exit debugger\n');
  }

  private clearChat(): void {
    this.messages = [];
    this.chatBox.setContent('');
    this.addWelcomeMessage();
    this.screen.render();
  }

  public addMessage(role: ChatMessage['role'], content: string): void {
    const message: ChatMessage = {
      role,
      content,
      timestamp: new Date(),
    };
    this.messages.push(message);

    // Format message
    let formatted = '';
    const time = message.timestamp.toLocaleTimeString();
    
    switch (role) {
      case 'user':
        formatted = chalk.bold.green(`[${time}] You: `) + content;
        break;
      case 'assistant':
        formatted = chalk.bold.blue(`[${time}] Agent: `) + content;
        break;
      case 'system':
        formatted = chalk.gray(content);
        break;
    }

    this.chatBox.pushLine(formatted);
    this.chatBox.setScrollPerc(100);
    this.screen.render();
  }

  public addOutput(content: string, isError: boolean = false): void {
    const formatted = isError ? chalk.red(content) : content;
    this.outputBox.log(formatted);
    this.screen.render();
  }

  public updateFiles(files: string[]): void {
    this.currentFiles = files;
    this.filesBox.setItems(files);
    this.screen.render();
  }

  public updateStatusBar(status: string): void {
    const time = new Date().toLocaleTimeString();
    const content = ` ${status} | Issue #${this.options.issueNumber} | ${time} | Press 'q' to quit `;
    this.statusBar.setContent(content);
    this.screen.render();
  }

  public showProgress(message: string): void {
    this.updateStatusBar(`⏳ ${message}...`);
  }

  public hideProgress(): void {
    this.updateStatusBar('Ready');
  }

  public render(): void {
    this.screen.render();
  }

  public destroy(): void {
    this.screen.destroy();
  }
}