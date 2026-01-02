import { useState, useEffect, useCallback } from 'react';
import {
  Page,
  Layout,
  LegacyCard,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Icon,
  Badge,
  Banner,
  EmptyState,
  DataTable,
  Box,
  Modal,
  RadioButton,
  Select,
  List
} from '@shopify/polaris';
import {
  CheckCircleIcon,
  ClockIcon,
  AlertCircleIcon,
  SettingsIcon,
  PlayIcon,
  UndoIcon,
  ChevronRightIcon
} from '@shopify/polaris-icons';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import type { WatermarkJob } from '../types/api';

export function Dashboard() {
  const navigate = useNavigate();
  const api = useApi();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<WatermarkJob[]>([]);
  const [stats, setStats] = useState({
    totalProcessed: 0,
    activeJobs: 0,
    failedJobs: 0
  });

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState(1);
  const [scopeType, setScopeType] = useState('all');
  const [collections, setCollections] = useState<any[]>([]);
  const [selectedCollection, setSelectedCollection] = useState('');
  const [creatingJob, setCreatingJob] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const data = await api.getJobs(10, 0);
      if (data.success) {
        setJobs(data.jobs);

        const active = data.jobs.filter((j: any) => j.status === 'processing' || j.status === 'pending').length;
        const failed = data.jobs.filter((j: any) => j.status === 'failed').length;
        const total = data.jobs.reduce((acc: number, j: any) => acc + (j.processed_products || 0), 0);

        setStats({
          activeJobs: active,
          failedJobs: failed,
          totalProcessed: total
        });
      }
    } catch (error) {
      console.error('Dashboard load failed:', error);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Load collections when needed
  const loadCollections = useCallback(async () => {
    try {
      const data = await api.getCollections();
      if (data.success) {
        setCollections(data.collections.map(c => ({ label: c.title, value: c.id })));
      }
    } catch (e) {
      console.error('Failed to load collections', e);
    }
  }, [api]);

  const handleOpenModal = () => {
    setIsModalOpen(true);
    setModalStep(1);
    loadCollections();
  };

  const handleStartJob = async () => {
    setCreatingJob(true);
    try {
      const value = scopeType === 'collection' ? selectedCollection : null;
      const data = await api.createJob(scopeType, value, 0);
      if (data.success) {
        setIsModalOpen(false);
        fetchData();
      }
    } catch (error) {
      console.error('Failed to create job:', error);
    } finally {
      setCreatingJob(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed': return <Badge tone="success">Completed</Badge>;
      case 'processing': return <Badge tone="info" progress="partiallyComplete">Processing</Badge>;
      case 'pending': return <Badge>Pending</Badge>;
      case 'failed': return <Badge tone="critical">Failed</Badge>;
      case 'rolled_back': return <Badge tone="warning">Rolled Back</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const rows = jobs.map(job => [
    <Text variant="bodyMd" fontWeight="bold" as="span">#{job.id.slice(0, 8)}</Text>,
    job.job_type.toUpperCase(),
    getStatusBadge(job.status),
    `${job.processed_products}/${job.total_products}`,
    new Date(job.created_at).toLocaleDateString(),
    <div key={job.id} style={{ display: 'flex', gap: '8px' }}>
      <Button
        variant="tertiary"
        icon={UndoIcon}
        disabled={job.status !== 'completed'}
        onClick={() => api.rollbackJob(job.id)}
      >
        Rollback
      </Button>
    </div>
  ]);

  if (loading && jobs.length === 0) {
    return <Page title="Dashboard"><LegacyCard sectioned><Box padding="800" textAlign="center"><Spinner size="large" /></Box></LegacyCard></Page>;
  }

  return (
    <Page title="Dashboard">
      <Layout>
        <Layout.Section>
          <Banner title="Brand Protection Suite" tone="info">
            <p>You have protected <b>{stats.totalProcessed}</b> images across your store. Monitor your active jobs below.</p>
          </Banner>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <LegacyCard sectioned>
            <BlockStack gap="200" align="center">
              <Text variant="headingXl" as="p">
                {stats.activeJobs}
              </Text>
              <InlineStack gap="100">
                <Icon source={ClockIcon} tone="subdued" />
                <Text variant="bodySm" as="span" tone="subdued">Active Jobs</Text>
              </InlineStack>
            </BlockStack>
          </LegacyCard>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <LegacyCard sectioned>
            <BlockStack gap="200" align="center">
              <Text variant="headingXl" as="p">
                {stats.totalProcessed}
              </Text>
              <InlineStack gap="100">
                <Icon source={CheckCircleIcon} tone="success" />
                <Text variant="bodySm" as="span" tone="subdued">Protected Media</Text>
              </InlineStack>
            </BlockStack>
          </LegacyCard>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <LegacyCard sectioned>
            <BlockStack gap="200" align="center">
              <Text variant="headingXl" as="p" tone={stats.failedJobs > 0 ? 'critical' : 'subdued'}>
                {stats.failedJobs}
              </Text>
              <InlineStack gap="100">
                <Icon source={AlertCircleIcon} tone={stats.failedJobs > 0 ? 'critical' : 'subdued'} />
                <Text variant="bodySm" as="span" tone="subdued">Errors</Text>
              </InlineStack>
            </BlockStack>
          </LegacyCard>
        </Layout.Section>

        <Layout.Section>
          <InlineStack gap="400" wrap={false}>
            <Box width="50%">
              <LegacyCard sectioned>
                <EmptyState
                  heading="Watermark Studio"
                  action={{
                    content: 'Configure Design',
                    onAction: () => navigate('/settings'),
                    icon: SettingsIcon
                  }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Change your watermark design, position, and transparency.</p>
                </EmptyState>
              </LegacyCard>
            </Box>
            <Box width="50%">
              <LegacyCard sectioned>
                <EmptyState
                  heading="Apply to Products"
                  action={{
                    content: 'Start Bulk Process',
                    onAction: handleOpenModal,
                    icon: PlayIcon
                  }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Start a new watermark application on your selected products.</p>
                </EmptyState>
              </LegacyCard>
            </Box>
          </InlineStack>
        </Layout.Section>

        <Layout.Section>
          <LegacyCard title="Activity Feed" sectioned>
            {jobs.length > 0 ? (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
                headings={['Job ID', 'Type', 'Status', 'Progress', 'Date', 'Actions']}
                rows={rows as any}
              />
            ) : (
              <EmptyState
                heading="No activity yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Configure your studio and start your first bulk protection.</p>
              </EmptyState>
            )}
          </LegacyCard>
        </Layout.Section>
      </Layout>

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Apply Watermark Bulk Process"
        primaryAction={{
          content: modalStep === 1 ? 'Next' : 'Start Process',
          onAction: modalStep === 1 ? () => setModalStep(2) : handleStartJob,
          loading: creatingJob,
          disabled: scopeType === 'collection' && !selectedCollection
        }}
        secondaryActions={[
          {
            content: modalStep === 1 ? 'Cancel' : 'Back',
            onAction: modalStep === 1 ? () => setIsModalOpen(false) : () => setModalStep(1),
          },
        ]}
      >
        <Modal.Section>
          {modalStep === 1 ? (
            <BlockStack gap="400">
              <Text as="p" variant="bodyMd">Select which products should receive the current watermark design.</Text>
              <RadioButton
                label="All Active Products"
                checked={scopeType === 'all'}
                id="all"
                name="scope"
                onChange={() => setScopeType('all')}
              />
              <RadioButton
                label="Specific Collection"
                checked={scopeType === 'collection'}
                id="collection"
                name="scope"
                onChange={() => setScopeType('collection')}
              />
              {scopeType === 'collection' && (
                <Box paddingBlockStart="200">
                  <Select
                    label="Choose Collection"
                    options={[{ label: 'Choose...', value: '' }, ...collections]}
                    value={selectedCollection}
                    onChange={setSelectedCollection}
                  />
                </Box>
              )}
            </BlockStack>
          ) : (
            <BlockStack gap="400">
              <Banner tone="warning">
                <p><b>Original images are kept as backups.</b> You can revert changes anytime using the Rollback button in the dashboard.</p>
              </Banner>
              <List type="bullet">
                <List.Item>Processing scope: <b>{scopeType.toUpperCase()}</b></List.Item>
                <List.Item>Estimated duration: Depends on product count.</List.Item>
                <List.Item>Status: New images will be set as <b>Featured</b>.</List.Item>
              </List>
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
