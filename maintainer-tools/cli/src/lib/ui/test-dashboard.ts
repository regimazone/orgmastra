import blessed from 'blessed';
import contrib from 'blessed-contrib';
import chalk from 'chalk';
import { EventEmitter } from 'events';

export interface TestResult {
  id: string;
  name: string;
  success: boolean;
  message: string;
  duration: number;
  error?: Error;
}

export interface TestDashboardOptions {
  mode: string;
  totalTests: number;
}

export class TestDashboard extends EventEmitter {
  private screen: blessed.Widgets.Screen;
  private grid: any;
  private gauge: any;
  private testList: blessed.Widgets.ListElement;
  public log: blessed.Widgets.Log;
  private sparkline: any;
  private statusBar: blessed.Widgets.BoxElement;
  
  private completedTests = 0;
  public testResults: TestResult[] = [];
  private testDurations: number[] = [];

  constructor(private options: TestDashboardOptions) {
    super();
    this.screen = blessed.screen({
      smartCSR: true,
      title: `Mastra Smoke Tests - ${options.mode}`,
      fullUnicode: true,
    });
    
    this.createLayout();
    this.setupEventHandlers();
  }

  private createLayout(): void {
    this.grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });

    // Header
    const header = this.grid.set(0, 0, 1, 12, blessed.box, {
      content: `{center}🧪 Mastra Smoke Test Dashboard - ${this.options.mode.toUpperCase()}{/center}`,
      tags: true,
      style: {
        fg: 'cyan',
        bold: true,
      },
    });

    // Progress gauge
    this.gauge = this.grid.set(1, 0, 2, 6, contrib.gauge, {
      label: 'Overall Progress',
      stroke: 'green',
      fill: 'white',
      showLabel: true,
    });

    // Performance sparkline
    this.sparkline = this.grid.set(1, 6, 2, 6, contrib.sparkline, {
      label: 'Test Duration (ms)',
      tags: true,
      style: {
        fg: 'blue',
      },
    });

    // Test list
    this.testList = this.grid.set(3, 0, 5, 6, blessed.list, {
      label: ' Tests ',
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        selected: { fg: 'black', bg: 'green' },
      },
      mouse: true,
      keys: true,
      vi: true,
      scrollable: true,
    });

    // Test details box
    const detailsBox = this.grid.set(3, 6, 5, 6, blessed.box, {
      label: ' Test Details ',
      border: { type: 'line' },
      style: {
        border: { fg: 'magenta' },
      },
      scrollable: true,
      alwaysScroll: true,
    });

    // Log output
    this.log = this.grid.set(8, 0, 3, 12, blessed.log, {
      label: ' Test Output ',
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
      },
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
    });

    // Status bar
    this.statusBar = this.grid.set(11, 0, 1, 12, blessed.box, {
      style: {
        fg: 'white',
        bg: 'blue',
      },
    });

    // Initialize status
    this.updateStatusBar('Initializing tests...');
    this.gauge.setPercent(0);
  }

  private setupEventHandlers(): void {
    // Global keys
    this.screen.key(['escape', 'q', 'C-c'], () => {
      this.emit('quit');
      return process.exit(0);
    });

    this.screen.key(['r'], () => {
      const failedTests = this.testResults.filter(r => !r.success);
      if (failedTests.length > 0) {
        this.emit('rerun-failed', failedTests);
      }
    });

    this.screen.key(['s'], () => {
      this.emit('save-report');
    });

    this.screen.key(['d'], () => {
      this.showTestDetails();
    });

    // Test list selection
    this.testList.on('select', (item, index) => {
      this.showTestDetails(index);
    });
  }

  public startTest(testId: string, testName: string): void {
    const index = this.testList.items.findIndex(item => 
      item.getText().includes(testName)
    );
    
    if (index !== -1) {
      this.testList.setItem(index, `🔄 ${testName}`);
    } else {
      this.testList.addItem(`🔄 ${testName}`);
    }
    
    this.log.log(chalk.cyan(`\nRunning: ${testName}`));
    this.updateStatusBar(`Running: ${testName}`);
    this.screen.render();
  }

  public completeTest(result: TestResult): void {
    this.completedTests++;
    this.testResults.push(result);
    this.testDurations.push(result.duration);

    // Update test list
    const index = this.testList.items.findIndex(item => 
      item.getText().includes(result.name)
    );
    
    if (index !== -1) {
      const icon = result.success ? '✅' : '❌';
      const duration = `(${result.duration}ms)`;
      this.testList.setItem(index, `${icon} ${result.name} ${duration}`);
    }

    // Update log
    if (result.success) {
      this.log.log(chalk.green(`✅ ${result.message}`));
    } else {
      this.log.log(chalk.red(`❌ ${result.message}`));
      if (result.error) {
        this.log.log(chalk.red(result.error.stack || result.error.message));
      }
    }

    // Update progress
    const progress = this.completedTests / this.options.totalTests;
    this.gauge.setPercent(progress);

    // Update sparkline
    this.sparkline.setData(['Test Duration'], [this.testDurations]);

    // Update status
    this.updateStatusBar(`Completed ${this.completedTests}/${this.options.totalTests} tests`);
    
    this.screen.render();
  }

  public showSummary(): void {
    const passed = this.testResults.filter(r => r.success).length;
    const failed = this.testResults.filter(r => !r.success).length;
    const totalDuration = this.testResults.reduce((sum, r) => sum + r.duration, 0);
    const avgDuration = Math.round(totalDuration / this.testResults.length);

    this.log.log(chalk.bold.white('\n' + '='.repeat(60)));
    this.log.log(chalk.bold.white('Test Summary:'));
    this.log.log(chalk.green(`  ✅ Passed: ${passed}`));
    if (failed > 0) {
      this.log.log(chalk.red(`  ❌ Failed: ${failed}`));
    }
    this.log.log(chalk.gray(`  ⏱  Total Duration: ${totalDuration}ms`));
    this.log.log(chalk.gray(`  ⚡ Average Duration: ${avgDuration}ms`));
    this.log.log(chalk.bold.white('='.repeat(60)));

    if (failed === 0) {
      this.updateStatusBar(chalk.green('All tests passed! 🎉') + ' | Press q to quit');
      this.gauge.setStack([
        { percent: 100, stroke: 'green' }
      ]);
    } else {
      const passRate = Math.round((passed / this.testResults.length) * 100);
      this.updateStatusBar(
        chalk.red(`${failed} tests failed (${passRate}% pass rate)`) + 
        ' | Press q to quit, r to rerun failed'
      );
      this.gauge.setStack([
        { percent: passed / this.testResults.length, stroke: 'green' },
        { percent: failed / this.testResults.length, stroke: 'red' }
      ]);
    }

    this.screen.render();
  }

  private showTestDetails(index?: number): void {
    if (index === undefined) {
      index = this.testList.selected;
    }

    const result = this.testResults[index];
    if (!result) return;

    const details = this.grid.set(3, 6, 5, 6, blessed.box, {
      label: ` ${result.name} `,
      border: { type: 'line' },
      style: {
        border: { fg: result.success ? 'green' : 'red' },
      },
      scrollable: true,
      content: this.formatTestDetails(result),
      tags: true,
    });

    this.screen.render();
  }

  private formatTestDetails(result: TestResult): string {
    let content = '';
    content += `{bold}Status:{/bold} ${result.success ? '{green-fg}PASSED{/}' : '{red-fg}FAILED{/}'}\n`;
    content += `{bold}Duration:{/bold} ${result.duration}ms\n`;
    content += `{bold}Message:{/bold} ${result.message}\n`;
    
    if (result.error) {
      content += `\n{bold}Error:{/bold}\n{red-fg}${result.error.message}{/}\n`;
      if (result.error.stack) {
        content += `\n{bold}Stack:{/bold}\n{gray-fg}${result.error.stack}{/}`;
      }
    }

    return content;
  }

  private updateStatusBar(status: string): void {
    const time = new Date().toLocaleTimeString();
    const shortcuts = ' | s: save report | d: details | q: quit';
    this.statusBar.setContent(` ${status} | ${time}${shortcuts} `);
    this.screen.render();
  }

  public render(): void {
    this.screen.render();
  }

  public destroy(): void {
    this.screen.destroy();
  }
}