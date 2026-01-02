import { useState, useEffect, useCallback } from 'react';
import {
  Page,
  Layout,
  Card,
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
  List,
  Spinner
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
    return (
      <Page title="Dashboard">
        <Card padding="500">
          <Box padding="800">
            <InlineStack align="center">
              <Spinner size="large" />
            </InlineStack>
          </Box>
        </Card>
      </Page>
    );
  }

  return (
    <Page fullWidth>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: 'var(--p-space-400)' }}>
        <BlockStack gap="600">
          {/* Hero Section */}
          <div className="hero-banner">
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <BlockStack gap="100">
                  <Text variant="headingLg" as="h1">Studio Dashboard</Text>
                  <Text variant="bodyMd" as="p" tone="subdued">
                    You have protected <span className="hero-stat-highlight">{stats.totalProcessed}</span> images across your store.
                  </Text>
                </BlockStack>
                <div className="glass-badge">
                  <Text variant="bodySm" fontWeight="bold" as="span">v1.2.0 Stable</Text>
                </div>
              </InlineStack>
            </BlockStack>
          </div>

          {/* Stats Grid */}
          <Layout>
            <Layout.Section variant="oneThird">
              <Card padding="0">
                <Box padding="400" minHeight="120px">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text variant="bodySm" tone="subdued" fontWeight="bold" as="h3">ACTIVE JOBS</Text>
                      <Text variant="headingXl" as="p">{stats.activeJobs}</Text>
                    </BlockStack>
                    <div className="icon-circle" style={{ color: '#6366f1' }}>
                      <Icon source={ClockIcon} />
                    </div>
                  </InlineStack>
                </Box>
                <div style={{ height: '4px', background: '#6366f1' }} />
              </Card>
            </Layout.Section>
            <Layout.Section variant="oneThird">
              <Card padding="0">
                <Box padding="400" minHeight="120px">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text variant="bodySm" tone="subdued" fontWeight="bold" as="h3">PROTECTED MEDIA</Text>
                      <Text variant="headingXl" as="p">{stats.totalProcessed}</Text>
                    </BlockStack>
                    <div className="icon-circle" style={{ color: '#22c55e' }}>
                      <Icon source={CheckCircleIcon} />
                    </div>
                  </InlineStack>
                </Box>
                <div style={{ height: '4px', background: '#22c55e' }} />
              </Card>
            </Layout.Section>
            <Layout.Section variant="oneThird">
              <Card padding="0">
                <Box padding="400" minHeight="120px">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text variant="bodySm" tone="subdued" fontWeight="bold" as="h3">SYSTEM ALERTS</Text>
                      <Text variant="headingXl" as="p" tone={stats.failedJobs > 0 ? 'critical' : 'success'}>
                        {stats.failedJobs === 0 ? 'Healthy' : stats.failedJobs}
                      </Text>
                    </BlockStack>
                    <div className="icon-circle" style={{ color: stats.failedJobs > 0 ? '#ef4444' : '#22c55e' }}>
                      <Icon source={AlertCircleIcon} />
                    </div>
                  </InlineStack>
                </Box>
                <div style={{ height: '4px', background: stats.failedJobs > 0 ? '#ef4444' : '#22c55e' }} />
              </Card>
            </Layout.Section>

            {/* Main Content Area */}
            <Layout.Section>
              <InlineStack gap="400" wrap={false}>
                <Box width="50%">
                  <Card padding="600">
                    <BlockStack gap="400" align="center">
                      <div className="icon-circle" style={{ width: '64px', height: '64px', background: 'var(--p-color-bg-surface-secondary)' }}>
                        <Icon source={SettingsIcon} tone="base" />
                      </div>
                      <BlockStack gap="100" align="center">
                        <Text variant="headingMd" as="h2">Studio Designer</Text>
                        <Text variant="bodyMd" as="p" tone="subdued">
                          Craft your brand Identity. Adjust transparency, position and design.
                        </Text>
                      </BlockStack>
                      <Button size="large" variant="secondary" onClick={() => navigate('/settings')} fullWidth>
                        Open Studio
                      </Button>
                    </BlockStack>
                  </Card>
                </Box>
                <Box width="50%">
                  <Card padding="600">
                    <BlockStack gap="400" align="center">
                      <div className="icon-circle" style={{ width: '64px', height: '64px', background: 'var(--p-color-bg-internal-info-secondary)' }}>
                        <Icon source={PlayIcon} tone="info" />
                      </div>
                      <BlockStack gap="100" align="center">
                        <Text variant="headingMd" as="h2">Apply Watermark</Text>
                        <Text variant="bodyMd" as="p" tone="subdued">
                          Ready to protect? Start a bulk process for products or collections.
                        </Text>
                      </BlockStack>
                      <Button size="large" variant="primary" onClick={handleOpenModal} fullWidth>
                        Launch Process
                      </Button>
                    </BlockStack>
                  </Card>
                </Box>
              </InlineStack>
            </Layout.Section>

            {/* Activity Table */}
            <Layout.Section>
              <Card padding="0">
                <Box padding="400" borderBlockEndWidth="025" borderColor="border">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" as="h2">Recent Activity</Text>
                    <Badge tone="info">Live Updates</Badge>
                  </InlineStack>
                </Box>
                <div style={{ padding: '0 16px' }}>
                  {jobs.length > 0 ? (
                    <DataTable
                      columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
                      headings={['Job ID', 'Type', 'Status', 'Progress', 'Date', 'Actions']}
                      rows={rows as any}
                    />
                  ) : (
                    <Box padding="800">
                      <EmptyState
                        heading="No activity yet"
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                      >
                        <p>Configure your studio and start your first bulk protection.</p>
                      </EmptyState>
                    </Box>
                  )}
                </div>
                <Box padding="300" borderBlockStartWidth="025" borderColor="border">
                  <InlineStack align="center">
                    <Text variant="bodySm" tone="subdued" as="p">Viewing last 10 operations</Text>
                  </InlineStack>
                </Box>
              </Card>
            </Layout.Section>
          </Layout>
        </BlockStack>
      </div>

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Quick Apply Wizard"
        primaryAction={{
          content: modalStep === 1 ? 'Continue' : 'Start Processing',
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
              <Banner tone="info">
                <p>Choose the scope of your watermark application. All original images are backed up securely.</p>
              </Banner>
              <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="200">
                  <RadioButton
                    label="Entire Store (All Products)"
                    checked={scopeType === 'all'}
                    id="all"
                    name="scope"
                    onChange={() => setScopeType('all')}
                  />
                  <Text variant="bodySm" tone="subdued" as="p">Applies to every active product currently in your catalog.</Text>
                </BlockStack>
              </Box>
              <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="200">
                  <RadioButton
                    label="Selective Collection"
                    checked={scopeType === 'collection'}
                    id="collection"
                    name="scope"
                    onChange={() => setScopeType('collection')}
                  />
                  {scopeType === 'collection' && (
                    <Box paddingBlockStart="200">
                      <Select
                        label="Select Target Collection"
                        options={[{ label: 'Select a collection...', value: '' }, ...collections]}
                        value={selectedCollection}
                        onChange={setSelectedCollection}
                      />
                    </Box>
                  )}
                </BlockStack>
              </Box>
            </BlockStack>
          ) : (
            <BlockStack gap="400">
              <div style={{ padding: '24px', background: '#fff9e6', borderRadius: '12px', border: '1px solid #ffe58f' }}>
                <BlockStack gap="300">
                  <InlineStack gap="200">
                    <Icon source={AlertCircleIcon} tone="warning" />
                    <Text variant="headingSm" as="h3">Safety Confirmation</Text>
                  </InlineStack>
                  <Text variant="bodyMd" as="p">
                    This process will create new watermarked versions of your images.
                    <b> You can revert this at any time </b> using the Rollback button in your dashboard.
                  </Text>
                </BlockStack>
              </div>
              <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                <List type="bullet">
                  <List.Item>Target: <b>{scopeType === 'all' ? 'All Products' : 'Selected Collection'}</b></List.Item>
                  <List.Item>Estimated duration depends on the number of images.</List.Item>
                  <List.Item>New images will automatically become the primary product images.</List.Item>
                </List>
              </Box>
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
