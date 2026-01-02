import { useState, useCallback, useEffect } from 'react';
import {
    Page,
    Layout,
    Card,
    FormLayout,
    TextField,
    Select,
    RangeSlider,
    Checkbox,
    InlineStack,
    BlockStack,
    Icon,
    Banner,
    SkeletonBodyText,
    Badge,
    Box,
    ProgressBar,
    Text,
    ButtonGroup,
    Button
} from '@shopify/polaris';
import {
    PlusIcon,
    SettingsIcon,
    ImageIcon,
    TextIcon,
    MobileIcon,
    ViewIcon,
    SaveIcon
} from '@shopify/polaris-icons';
import { useApi } from '../hooks/useApi';
import type { WatermarkSettings } from '../types/api';

const POSITION_OPTIONS = [
    { label: 'Top Left', value: 'top-left' },
    { label: 'Top Center', value: 'top-center' },
    { label: 'Top Right', value: 'top-right' },
    { label: 'Middle Left', value: 'middle-left' },
    { label: 'Center', value: 'center' },
    { label: 'Middle Right', value: 'middle-right' },
    { label: 'Bottom Left', value: 'bottom-left' },
    { label: 'Bottom Center', value: 'bottom-center' },
    { label: 'Bottom Right', value: 'bottom-right' },
];

const FONT_OPTIONS = [
    { label: 'Arial', value: 'Arial' },
    { label: 'Helvetica', value: 'Helvetica' },
    { label: 'Times New Roman', value: 'Times New Roman' },
    { label: 'Courier New', value: 'Courier New' },
    { label: 'Verdana', value: 'Verdana' },
    { label: 'Impact', value: 'Impact' },
];

export function Settings() {
    const api = useApi();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [settings, setSettings] = useState<WatermarkSettings>({
        logo_url: null,
        logo_position: 'bottom-right',
        logo_opacity: 0.8,
        logo_margin: 20,
        logo_scale: 0.2,
        text_content: '',
        text_font: 'Arial',
        text_size: 40,
        text_color: '#FFFFFF',
        text_position: 'bottom-right',
        text_opacity: 0.8,
        text_outline: true,
        text_outline_color: '#000000',
        mobile_enabled: false,
        mobile_position: 'bottom-right',
        mobile_scale: 0.15,
    });

    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [sampleUrl, setSampleUrl] = useState('https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png');

    // Load initial settings
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const data = await api.getWatermarkSettings();
                if (data.success && data.settings) {
                    setSettings(data.settings);
                }
            } catch (error) {
                console.error('Failed to load settings:', error);
            } finally {
                setLoading(false);
            }
        };

        loadSettings();
    }, [api]);

    // Handle preview generation
    const generatePreview = useCallback(async () => {
        setPreviewLoading(true);
        try {
            const data = await api.generatePreview(sampleUrl, settings);
            if (data.preview) {
                setPreviewImage(data.preview);
            }
        } catch (error) {
            console.error('Preview failed:', error);
        } finally {
            setPreviewLoading(false);
        }
    }, [api, sampleUrl, settings]);

    // Initial preview on load
    useEffect(() => {
        if (!loading) {
            generatePreview();
        }
    }, [loading]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const data = await api.saveWatermarkSettings(settings);
            if (data.success) {
                // Success
            }
        } catch (error) {
            console.error('Save failed:', error);
        } finally {
            setSaving(false);
        }
    };

    const updateSetting = (key: keyof WatermarkSettings, value: any) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    if (loading) {
        return (
            <Page title="Watermark Studio">
                <Layout>
                    <Layout.Section variant="oneHalf">
                        <Card padding="500">
                            <SkeletonBodyText lines={10} />
                        </Card>
                    </Layout.Section>
                    <Layout.Section variant="oneHalf">
                        <Card padding="500">
                            <SkeletonBodyText lines={10} />
                        </Card>
                    </Layout.Section>
                </Layout>
            </Page>
        );
    }

    return (
        <Page
            title="Watermark Studio"
            subtitle="Design and preview your custom watermark before applying to products."
            primaryAction={{
                content: 'Save Settings',
                onAction: handleSave,
                loading: saving,
                icon: SaveIcon
            }}
        >
            <Layout>
                {/* Left Side: Controls */}
                <Layout.Section variant="oneHalf">
                    <BlockStack gap="400">
                        {/* Logo Settings */}
                        <Card padding="500">
                            <BlockStack gap="400">
                                <InlineStack gap="200" align="start">
                                    <Icon source={ImageIcon} />
                                    <Text variant="headingMd" as="h2">Logo Branding</Text>
                                </InlineStack>
                                <FormLayout>
                                    <TextField
                                        label="Logo URL"
                                        value={settings.logo_url || ''}
                                        onChange={(val) => updateSetting('logo_url', val)}
                                        autoComplete="off"
                                        helpText="Enter the URL of your logo image (PNG/SVG recommended for transparency)."
                                    />

                                    {settings.logo_url && (
                                        <FormLayout.Group>
                                            <Select
                                                label="Logo Position"
                                                options={POSITION_OPTIONS}
                                                value={settings.logo_position}
                                                onChange={(val) => updateSetting('logo_position', val)}
                                            />
                                            <RangeSlider
                                                label={`Logo Scale: ${Math.round(settings.logo_scale * 100)}%`}
                                                value={settings.logo_scale}
                                                min={0.05}
                                                max={0.5}
                                                step={0.01}
                                                onChange={(val) => updateSetting('logo_scale', val)}
                                                output
                                            />
                                        </FormLayout.Group>
                                    )}

                                    {settings.logo_url && (
                                        <FormLayout.Group>
                                            <RangeSlider
                                                label={`Logo Opacity: ${Math.round(settings.logo_opacity * 100)}%`}
                                                value={settings.logo_opacity}
                                                min={0.1}
                                                max={1.0}
                                                step={0.1}
                                                onChange={(val) => updateSetting('logo_opacity', val)}
                                                output
                                            />
                                            <TextField
                                                label="Logo Margin (px)"
                                                type="number"
                                                value={settings.logo_margin.toString()}
                                                onChange={(val) => updateSetting('logo_margin', parseInt(val) || 0)}
                                                autoComplete="off"
                                            />
                                        </FormLayout.Group>
                                    )}
                                </FormLayout>
                            </BlockStack>
                        </Card>

                        {/* Text Settings */}
                        <Card padding="500">
                            <BlockStack gap="400">
                                <InlineStack gap="200" align="start">
                                    <Icon source={TextIcon} />
                                    <Text variant="headingMd" as="h2">Text Copyright</Text>
                                </InlineStack>
                                <FormLayout>
                                    <TextField
                                        label="Watermark Text"
                                        value={settings.text_content || ''}
                                        onChange={(val) => updateSetting('text_content', val)}
                                        placeholder="e.g. © 2026 My Store"
                                        autoComplete="off"
                                    />

                                    {settings.text_content && (
                                        <>
                                            <FormLayout.Group>
                                                <Select
                                                    label="Text Font"
                                                    options={FONT_OPTIONS}
                                                    value={settings.text_font}
                                                    onChange={(val) => updateSetting('text_font', val)}
                                                />
                                                <TextField
                                                    label="Font Size"
                                                    type="number"
                                                    value={settings.text_size.toString()}
                                                    onChange={(val) => updateSetting('text_size', parseInt(val) || 0)}
                                                    autoComplete="off"
                                                />
                                            </FormLayout.Group>
                                            <FormLayout.Group>
                                                <Select
                                                    label="Text Position"
                                                    options={POSITION_OPTIONS}
                                                    value={settings.text_position}
                                                    onChange={(val) => updateSetting('text_position', val)}
                                                />
                                                <RangeSlider
                                                    label={`Text Opacity: ${Math.round(settings.text_opacity * 100)}%`}
                                                    value={settings.text_opacity}
                                                    min={0.1}
                                                    max={1.0}
                                                    step={0.1}
                                                    onChange={(val) => updateSetting('text_opacity', val)}
                                                    output
                                                />
                                            </FormLayout.Group>
                                            <InlineStack gap="400" align="start">
                                                <Checkbox
                                                    label="Enable Outline"
                                                    checked={settings.text_outline}
                                                    onChange={(val) => updateSetting('text_outline', val)}
                                                />
                                            </InlineStack>
                                        </>
                                    )}
                                </FormLayout>
                            </BlockStack>
                        </Card>

                        {/* Mobile Settings */}
                        <Card padding="500">
                            <BlockStack gap="400">
                                <InlineStack gap="200" align="start">
                                    <Icon source={MobileIcon} />
                                    <Text variant="headingMd" as="h2">Mobile Optimization</Text>
                                </InlineStack>
                                <FormLayout>
                                    <Checkbox
                                        label="Use separate profile for vertical (mobile) images"
                                        checked={settings.mobile_enabled}
                                        onChange={(val) => updateSetting('mobile_enabled', val)}
                                        helpText="If checked, you can adjust how the watermark appears on portrait images commonly seen on mobile devices."
                                    />

                                    {settings.mobile_enabled && (
                                        <FormLayout.Group>
                                            <Select
                                                label="Mobile Position"
                                                options={POSITION_OPTIONS}
                                                value={settings.mobile_position}
                                                onChange={(val) => updateSetting('mobile_position', val)}
                                            />
                                            <RangeSlider
                                                label={`Mobile Scale: ${Math.round(settings.mobile_scale * 100)}%`}
                                                value={settings.mobile_scale}
                                                min={0.05}
                                                max={0.5}
                                                step={0.01}
                                                onChange={(val) => updateSetting('mobile_scale', val)}
                                                output
                                            />
                                        </FormLayout.Group>
                                    )}
                                </FormLayout>
                            </BlockStack>
                        </Card>
                    </BlockStack>
                </Layout.Section>

                {/* Right Side: Virtual Preview */}
                <Layout.Section variant="oneHalf">
                    <Card
                        padding="500"
                    >
                        <BlockStack gap="400">
                            <InlineStack align="space-between">
                                <InlineStack gap="200">
                                    <Icon source={ViewIcon} />
                                    <Text variant="headingMd" as="h2">Real-time Preview</Text>
                                </InlineStack>
                                <ButtonGroup>
                                    <Button icon={ViewIcon} onClick={generatePreview} loading={previewLoading}>Refresh Preview</Button>
                                </ButtonGroup>
                            </InlineStack>

                            <Box
                                padding="400"
                                background="bg-surface-secondary"
                                borderRadius="200"
                                minHeight="400px"
                            >
                                <BlockStack align="center" gap="400">
                                    {previewLoading ? (
                                        <Box padding="800">
                                            <BlockStack align="center" gap="400">
                                                <SkeletonBodyText lines={3} />
                                                <ProgressBar progress={45} size="small" />
                                            </BlockStack>
                                        </Box>
                                    ) : (
                                        previewImage ? (
                                            <div style={{ position: 'relative', textAlign: 'center' }}>
                                                <img
                                                    src={previewImage}
                                                    style={{ maxWidth: '100%', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                    alt="Watermark Preview"
                                                />
                                                <Box paddingBlockStart="200">
                                                    <Badge tone="success" icon={SettingsIcon}>VIRTUAL PREVIEW</Badge>
                                                </Box>
                                            </div>
                                        ) : (
                                            <BlockStack align="center" gap="200">
                                                <Icon source={ImageIcon} tone="subdued" />
                                                <Text as="p" variant="bodyMd" tone="subdued">Configure your watermark to see a preview here.</Text>
                                            </BlockStack>
                                        )
                                    )}
                                </BlockStack>
                            </Box>

                            <TextField
                                label="Sample Image URL"
                                value={sampleUrl}
                                onChange={setSampleUrl}
                                helpText="Paste any image URL to see how your watermark looks on it."
                                autoComplete="off"
                            />

                            <Banner title="Draft Mode" tone="info">
                                <p>Preview uses unsaved settings. Don't forget to <b>Save Settings</b> before applying to your actual catalog.</p>
                            </Banner>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
