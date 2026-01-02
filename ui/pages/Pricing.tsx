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
} from '@shopify/polaris';
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
            title="Choose Your Plan"
            subtitle="Select the plan that fits your business needs"
            narrowWidth
        >
            <Layout>
                {plans.map((plan: any) => {
                    const isCurrent = plan.key === currentPlanKey;
                    return (
                        <Layout.Section key={plan.key}>
                            <Card>
                                <BlockStack gap="400">
                                    <InlineStack align="space-between" blockAlign="center">
                                        <Text as="h2" variant="headingLg">{plan.name}</Text>
                                        {isCurrent && <Badge tone="success">Current Plan</Badge>}
                                    </InlineStack>

                                    <Text as="p" variant="headingXl">
                                        ${plan.price}
                                        <Text as="span" variant="bodyMd" tone="subdued"> /month</Text>
                                    </Text>

                                    <BlockStack gap="200">
                                        <Text as="h3" variant="headingSm">Features:</Text>
                                        <List>
                                            {plan.features.map((feature: string, i: number) => (
                                                <List.Item key={i}>{feature}</List.Item>
                                            ))}
                                        </List>
                                    </BlockStack>

                                    <Button
                                        variant="primary"
                                        disabled={isCurrent}
                                        fullWidth
                                        onClick={() => {
                                            if (!isCurrent) {
                                                // Redirect to Shopify Managed Pricing page
                                                const shop = billing?.shop || '';
                                                const pricingUrl = `https://admin.shopify.com/store/${shop.replace('.myshopify.com', '')}/charges/pricing_plans`;
                                                window.open(pricingUrl, '_top');
                                            }
                                        }}
                                    >
                                        {isCurrent ? 'Current Plan' : `Select ${plan.name}`}
                                    </Button>
                                </BlockStack>
                            </Card>
                        </Layout.Section>
                    );
                })}

                <Layout.Section>
                    <Banner tone="info">
                        <p>Plan changes will be reflected in your next billing cycle. You can cancel or change your plan anytime.</p>
                    </Banner>
                </Layout.Section>
            </Layout>
        </Page>
    );
};
