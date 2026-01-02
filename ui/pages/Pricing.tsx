import React, { useEffect, useState } from 'react';
import {
    Page,
    Layout,
    Card,
    Button,
    Badge,
    Text,
    BlockStack,
    InlineStack,
    SkeletonBodyText,
    Banner,
    List,
    Box,
    Icon
} from '@shopify/polaris';
import { PlusIcon, SaveIcon } from '@shopify/polaris-icons';
import { useApi } from '../hooks/useApi';
import { BillingInfo } from '../types/api';

export const Pricing: React.FC = () => {
    const api = useApi();
    const [billing, setBilling] = useState<BillingInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api.getBillingInfo()
            .then(setBilling)
            .catch((e) => setError(e?.message || 'Failed to load pricing'))
            .finally(() => setLoading(false));
    }, [api]);

    if (loading) {
        return (
            <Page title="Pricing" narrowWidth>
                <Layout>
                    <Layout.Section>
                        <Card>
                            <SkeletonBodyText lines={5} />
                        </Card>
                    </Layout.Section>
                </Layout>
            </Page>
        );
    }

    if (error) {
        return (
            <Page title="Pricing" narrowWidth>
                <Layout>
                    <Layout.Section>
                        <Banner tone="critical">
                            <p>{error}</p>
                        </Banner>
                    </Layout.Section>
                </Layout>
            </Page>
        );
    }

    const currentPlanKey = billing?.currentPlan;
    const plans = billing?.plans ? Object.values(billing.plans) : [];

    return (
        <Page
            title="Subscription Plans"
            subtitle="Unlock professional watermarking features for your catalog."
            fullWidth
        >
            <div style={{ maxWidth: '1000px', margin: '0 auto', padding: 'var(--p-space-400)' }}>
                <Layout>
                    <Layout.Section>
                        <InlineStack gap="400" wrap={false} align="center">
                            {plans.map((plan: any) => {
                                const isCurrent = plan.key === currentPlanKey;
                                return (
                                    <Box key={plan.key} width="45%" minWidth="300px">
                                        <Card padding="600">
                                            <BlockStack gap="500">
                                                <InlineStack align="space-between">
                                                    <BlockStack gap="100">
                                                        <Text as="h2" variant="headingLg">{plan.name}</Text>
                                                        {isCurrent && <Badge tone="info">Activated</Badge>}
                                                    </BlockStack>
                                                    <div className="icon-circle" style={{ color: isCurrent ? '#6366f1' : '#cbd5e1' }}>
                                                        <Icon source={isCurrent ? SaveIcon : PlusIcon} />
                                                    </div>
                                                </InlineStack>

                                                <div style={{ padding: '24px 0', borderTop: '1px solid var(--p-color-border-subdued)', borderBottom: '1px solid var(--p-color-border-subdued)' }}>
                                                    <InlineStack align="start" blockAlign="end">
                                                        <Text as="p" variant="heading3xl">${plan.price}</Text>
                                                        <Box paddingInlineStart="200" paddingBlockEnd="100">
                                                            <Text variant="bodyMd" tone="subdued" as="span">/month</Text>
                                                        </Box>
                                                    </InlineStack>
                                                </div>

                                                <BlockStack gap="300">
                                                    <Text as="h3" variant="headingSm" tone="subdued">INCLUDED FEATURES</Text>
                                                    <List>
                                                        {plan.features.map((feature: string, i: number) => (
                                                            <List.Item key={i}>
                                                                <Text variant="bodyMd" as="span">{feature}</Text>
                                                            </List.Item>
                                                        ))}
                                                    </List>
                                                </BlockStack>

                                                <Button
                                                    size="large"
                                                    variant={isCurrent ? 'secondary' : 'primary'}
                                                    disabled={isCurrent}
                                                    fullWidth
                                                    onClick={() => {
                                                        if (!isCurrent) {
                                                            const shop = billing?.shop || '';
                                                            const pricingUrl = `https://admin.shopify.com/store/${shop.replace('.myshopify.com', '')}/charges/pricing_plans`;
                                                            window.open(pricingUrl, '_top');
                                                        }
                                                    }}
                                                >
                                                    {isCurrent ? 'Current Active Plan' : `Upgrade to ${plan.name}`}
                                                </Button>
                                            </BlockStack>
                                        </Card>
                                        {isCurrent && <div style={{ height: '4px', background: 'var(--p-color-bg-fill-info)', borderRadius: '0 0 8px 8px' }} />}
                                    </Box>
                                );
                            })}
                        </InlineStack>
                    </Layout.Section>

                    <Layout.Section>
                        <Box paddingBlockStart="600">
                            <Banner tone="info">
                                <p>Plan changes are handled securely via Shopify Managed Pricing. Billing will be reflected in your standard Shopify invoice.</p>
                            </Banner>
                        </Box>
                    </Layout.Section>
                </Layout>
            </div>
        </Page>
    );
};
