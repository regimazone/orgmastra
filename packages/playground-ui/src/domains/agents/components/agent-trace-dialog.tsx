import {
  SideDialog,
  SideDialogHeader,
  SideDialogContent,
  SideDialogTop,
  SideDialogKeyValueList,
  SideDialogSection,
  TextareaField,
  SelectField,
  FormActions,
} from '@/components/ui/elements';
import { Button } from '@/components/ui/elements/button';
import { ChevronRightIcon, DatabaseIcon, FileInputIcon, FileOutputIcon, FileTextIcon, GaugeIcon } from 'lucide-react';
import { faker } from '@faker-js/faker';
import { useState } from 'react';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { AgentIcon } from '@/ds/icons';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectValue, SelectTrigger } from '@/components/ui/select';
import Spinner from '@/components/ui/spinner';

type DialogMode = 'view' | 'save';

type AgentTraceDialogProps = {
  initialMode?: DialogMode;
  trace?: any;
  agent?: any;
  isOpen: boolean;
  onClose?: () => void;
  onCreate?: (dataset: any) => void;
  onNext?: (() => void) | null;
  onPrevious?: (() => void) | null;
  datasets?: any[];
  scorers?: any[];
};

export function AgentTraceDialog({
  initialMode = 'view' as DialogMode,
  isOpen,
  onClose,
  onNext,
  onPrevious,
  trace,
  agent,
  datasets = [],
  scorers = [],
}: AgentTraceDialogProps) {
  const [mode, setMode] = useState<DialogMode>(initialMode);
  const [targetDataset, setTargetDataset] = useState<string>('');
  const [isScoring, setIsScoring] = useState<boolean>(false);
  const [selectedScorer, setSelectedScorer] = useState<string>('');
  const [scores, setScores] = useState<any[]>([]);

  const handleCancel = () => {
    setMode('view');
  };

  const handleSave = () => {
    onClose?.();
    setMode('view');
  };

  const handleScore = () => {
    const score = {
      scorer: selectedScorer,
      score: Math.random() * 100,
      reason: faker.lorem.paragraphs({ min: 1, max: 1 }),
    };

    setIsScoring(true);
    setTimeout(() => {
      setIsScoring(false);
      setScores([...scores, score]);
    }, 5000);
  };

  console.log({ selectedScorer });

  return (
    <>
      <SideDialog dialogTitle="Dataset Details" isOpen={isOpen} onClose={onClose}>
        <SideDialogTop onNext={onNext} onPrevious={onPrevious} showInnerNav={mode === 'view'}>
          <div className="flex items-center gap-[0.5rem] text-icon4 text-[0.875rem]">
            <AgentIcon /> <span className="truncate max-w-[8rem]">{agent?.name}</span>
            <ChevronRightIcon />
            {['view', 'save'].includes(mode) && (
              <>
                <FileTextIcon />
                <span className="truncate">{trace?.id?.split('-')[0]}</span>
              </>
            )}
          </div>
        </SideDialogTop>
        <SideDialogContent isFullHeight={mode === 'save'}>
          {mode === 'view' && (
            <>
              <SideDialogHeader>
                <h2>Trace Details</h2>
                <div className="flex items-center gap-[.5rem]">
                  <Button onClick={() => setMode('save')}>
                    Save as Dataset Item
                    <DatabaseIcon />
                  </Button>
                </div>
              </SideDialogHeader>

              <SideDialogKeyValueList
                items={[
                  { key: 'Id', value: trace?.id || 'N/A' },
                  { key: 'Entity', value: agent?.name || 'N/A' },
                  { key: 'Entity type', value: 'Agent' },
                  {
                    key: 'Created at',
                    value: trace?.createdAt ? format(new Date(trace.createdAt), 'LLL do yyyy, hh:mm bb') : 'N/A',
                  },
                ]}
              />

              <SideDialogSection>
                <h3>
                  <FileInputIcon /> Input
                </h3>
                <div className="font-mono text-[0.8125rem] text-[#ccc]">
                  {trace?.input && <MarkdownRenderer className="[&_p]:leading-[1.6]">{trace.input}</MarkdownRenderer>}
                </div>
              </SideDialogSection>

              <SideDialogSection>
                <h3>
                  <FileOutputIcon />
                  Output
                </h3>
                <div className="font-mono text-[0.8125rem] text-[#ccc] ">
                  {trace?.output && <MarkdownRenderer className="[&_p]:leading-[1.6]">{trace.output}</MarkdownRenderer>}
                </div>
              </SideDialogSection>

              <SideDialogSection>
                <h3>
                  <GaugeIcon />
                  Scores
                </h3>

                {scores.length > 0 && (
                  <div className="grid gap-[1rem]">
                    {scores.map((score, index) => (
                      <dl
                        key={index}
                        className={cn(
                          'grid grid-cols-[auto_1fr] gap-[0.5rem] border-b border-border1 pb-[1rem]',
                          '[&>dt]:text-icon3 [&>dd]:text-icon4',
                        )}
                      >
                        <dt>Score:</dt>
                        <dd>{score.score.toFixed(2)}</dd>
                        <dt>Reason: </dt>
                        <dd className="text-icon4">{score.reason}</dd>
                        <dt>Scorer: </dt>
                        <dd className="text-icon4">My First Scorer</dd>
                      </dl>
                    ))}
                  </div>
                )}

                <div className="w-full flex items-center gap-[0.5rem] text-icon4 bg-[rgba(255,255,255,0.05)] p-[1rem] rounded-lg">
                  {isScoring ? (
                    <>
                      <Spinner /> Scoring...
                    </>
                  ) : (
                    <>
                      <SelectField
                        name="select-scorer"
                        value={selectedScorer}
                        onChange={value => {
                          setSelectedScorer(value);
                        }}
                        options={scorers.map(scorer => ({
                          value: scorer.id,
                          label: scorer.name,
                        }))}
                      />
                      <Button onClick={handleScore}>Score</Button>
                    </>
                  )}
                </div>
              </SideDialogSection>
            </>
          )}

          {mode === 'save' && (
            <div className={cn('grid grid-rows-[auto_auto_1fr_2fr_auto] gap-[2rem]')}>
              <SideDialogHeader>
                <h2>Store Trace as Dataset Item</h2>
              </SideDialogHeader>

              {mode === 'save' && (
                <SelectField
                  label="Dataset"
                  name="select-dataset"
                  value={targetDataset}
                  placeholder="Select a dataset"
                  onChange={value => {
                    setTargetDataset(value);
                  }}
                  options={datasets.map(dataset => ({
                    value: dataset.id,
                    label: dataset.name,
                  }))}
                />
              )}

              {mode === 'save' && (
                <>
                  <TextareaField label="Input" value={trace?.input} />
                  <TextareaField label="Output" value={trace?.output} />
                  <FormActions
                    onSubmit={handleSave}
                    onCancel={handleCancel}
                    isSubmitting={false}
                    submitLabel="Save"
                    cancelLabel="Cancel"
                  />
                </>
              )}
            </div>
          )}
        </SideDialogContent>
      </SideDialog>
    </>
  );
}
