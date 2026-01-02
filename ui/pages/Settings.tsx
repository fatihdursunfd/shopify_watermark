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
    Button,
    Spinner
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
            fullWidth
            backAction={{ content: 'Dashboard', onAction: () => window.history.back() }}
            title="Design Studio"
            primaryAction={{
                content: 'Save Changes',
                onAction: handleSave,
                loading: saving,
                icon: SaveIcon
            }}
        >
            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
                <Layout>
                    {/* Left: Configuration */}
                    <Layout.Section variant="oneHalf">
                        <BlockStack gap="500">
                            {/* Logo Section */}
                            <Card padding="500">
                                <BlockStack gap="400">
                                    <InlineStack align="space-between" blockAlign="center">
                                        <InlineStack gap="200" blockAlign="center">
                                            <div className="icon-circle" style={{ width: '32px', height: '32px' }}>
                                                <Icon source={ImageIcon} tone="base" />
                                            </div>
                                            <Text variant="headingMd" as="h2">Identity & Branding</Text>
                                        </InlineStack>
                                        {settings.logo_url && <Badge tone="success">Logo Active</Badge>}
                                    </InlineStack>

                                    <FormLayout>
                                        <TextField
                                            label="Brand Logo URL"
                                            value={settings.logo_url || ''}
                                            onChange={(val) => updateSetting('logo_url', val)}
                                            autoComplete="off"
                                            placeholder="https://your-domain.com/logo.png"
                                            helpText="Supports PNG, SVG, and JPEG. Transparent PNG/SVG is recommended."
                                        />

                                        {settings.logo_url && (
                                            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                                                <BlockStack gap="400">
                                                    <Select
                                                        label="Logo Placement"
                                                        options={POSITION_OPTIONS}
                                                        value={settings.logo_position}
                                                        onChange={(val) => updateSetting('logo_position', val)}
                                                    />
                                                    <RangeSlider
                                                        label={`Visual Scale: ${Math.round(settings.logo_scale * 100)}%`}
                                                        value={settings.logo_scale}
                                                        min={0.05}
                                                        max={0.5}
                                                        step={0.01}
                                                        onChange={(val) => updateSetting('logo_scale', val)}
                                                        output
                                                    />
                                                    <RangeSlider
                                                        label={`Visual Opacity: ${Math.round(settings.logo_opacity * 100)}%`}
                                                        value={settings.logo_opacity}
                                                        min={0.1}
                                                        max={1.0}
                                                        step={0.1}
                                                        onChange={(val) => updateSetting('logo_opacity', val)}
                                                        output
                                                    />
                                                    <TextField
                                                        label="Margin Offset (px)"
                                                        type="number"
                                                        value={settings.logo_margin.toString()}
                                                        onChange={(val) => updateSetting('logo_margin', parseInt(val) || 0)}
                                                        autoComplete="off"
                                                    />
                                                </BlockStack>
                                            </Box>
                                        )}
                                    </FormLayout>
                                </BlockStack>
                            </Card>

                            {/* Text Section */}
                            <Card padding="500">
                                <BlockStack gap="400">
                                    <InlineStack align="space-between" blockAlign="center">
                                        <InlineStack gap="200" blockAlign="center">
                                            <div className="icon-circle" style={{ width: '32px', height: '32px' }}>
                                                <Icon source={TextIcon} tone="base" />
                                            </div>
                                            <Text variant="headingMd" as="h2">Copyright Overlay</Text>
                                        </InlineStack>
                                        {settings.text_content && <Badge tone="info">Text Active</Badge>}
                                    </InlineStack>

                                    <FormLayout>
                                        <TextField
                                            label="Watermark Content"
                                            value={settings.text_content || ''}
                                            onChange={(val) => updateSetting('text_content', val)}
                                            placeholder="e.g. © 2026 Your Store Name"
                                            autoComplete="off"
                                        />

                                        {settings.text_content && (
                                            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                                                <BlockStack gap="400">
                                                    <Select
                                                        label="Typography Font"
                                                        options={FONT_OPTIONS}
                                                        value={settings.text_font}
                                                        onChange={(val) => updateSetting('text_font', val)}
                                                    />
                                                    <TextField
                                                        label="Text Size (px)"
                                                        type="number"
                                                        value={settings.text_size.toString()}
                                                        onChange={(val) => updateSetting('text_size', parseInt(val) || 0)}
                                                        autoComplete="off"
                                                    />
                                                    <Select
                                                        label="Text Placement"
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
                                                    <InlineStack gap="400">
                                                        <Box width="45%">
                                                            <TextField
                                                                label="Text Color"
                                                                type="text"
                                                                value={settings.text_color}
                                                                onChange={(val) => updateSetting('text_color', val)}
                                                                autoComplete="off"
                                                                suffix={<div style={{ width: '20px', height: '20px', background: settings.text_color, border: '1px solid #ccc', borderRadius: '4px' }} />}
                                                            />
                                                        </Box>
                                                        <Box width="45%">
                                                            <TextField
                                                                label="Outline Color"
                                                                type="text"
                                                                value={settings.text_outline_color}
                                                                onChange={(val) => updateSetting('text_outline_color', val)}
                                                                autoComplete="off"
                                                                suffix={<div style={{ width: '20px', height: '20px', background: settings.text_outline_color, border: '1px solid #ccc', borderRadius: '4px' }} />}
                                                            />
                                                        </Box>
                                                    </InlineStack>
                                                    <Checkbox
                                                        label="High Contrast Outline (Shadow)"
                                                        checked={settings.text_outline}
                                                        onChange={(val) => updateSetting('text_outline', val)}
                                                    />
                                                </BlockStack>
                                            </Box>
                                        )}
                                    </FormLayout>
                                </BlockStack>
                            </Card>

                            {/* Mobile Section */}
                            <Card padding="500">
                                <BlockStack gap="400">
                                    <InlineStack gap="200" blockAlign="center">
                                        <div className="icon-circle" style={{ width: '32px', height: '32px' }}>
                                            <Icon source={MobileIcon} tone="base" />
                                        </div>
                                        <Text variant="headingMd" as="h2">Mobile Refinement</Text>
                                    </InlineStack>
                                    <Checkbox
                                        label="Optimize for portrait/mobile orientation"
                                        checked={settings.mobile_enabled}
                                        onChange={(val) => updateSetting('mobile_enabled', val)}
                                    />
                                    {settings.mobile_enabled && (
                                        <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                                            <FormLayout.Group>
                                                <Select
                                                    label="Mobile Placement"
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
                                        </Box>
                                    )}
                                </BlockStack>
                            </Card>
                        </BlockStack>
                    </Layout.Section>

                    {/* Right: Live Preview */}
                    <Layout.Section variant="oneHalf">
                        <div style={{ position: 'sticky', top: '24px' }}>
                            <Card padding="0">
                                <Box padding="400" borderBlockEndWidth="025" borderColor="border">
                                    <InlineStack align="space-between" blockAlign="center">
                                        <InlineStack gap="200">
                                            <Icon source={ViewIcon} />
                                            <Text variant="headingMd" as="h2">Live Composition</Text>
                                        </InlineStack>
                                        <Button
                                            icon={ViewIcon}
                                            onClick={generatePreview}
                                            loading={previewLoading}
                                            variant="secondary"
                                        >
                                            Force Refresh
                                        </Button>
                                    </InlineStack>
                                </Box>

                                <Box padding="600" background="bg-surface-secondary">
                                    <BlockStack gap="400" align="center">
                                        {previewLoading ? (
                                            <div style={{ padding: '80px 0', width: '100%' }}>
                                                <BlockStack gap="400" align="center">
                                                    <Spinner size="large" />
                                                    <Text variant="bodyMd" as="p" tone="subdued">Synthesizing preview...</Text>
                                                </BlockStack>
                                            </div>
                                        ) : previewImage ? (
                                            <div style={{ position: 'relative' }}>
                                                <img
                                                    src={previewImage}
                                                    style={{
                                                        maxWidth: '100%',
                                                        borderRadius: '12px',
                                                        boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
                                                        border: '1px solid rgba(0,0,0,0.05)'
                                                    }}
                                                    alt="Composition Preview"
                                                />
                                                <div style={{ position: 'absolute', top: '12px', left: '12px' }}>
                                                    <Badge tone="info" icon={SettingsIcon}>Dynamic Preview</Badge>
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ padding: '80px 0', textAlign: 'center' }}>
                                                <BlockStack gap="200">
                                                    <Icon source={ImageIcon} tone="subdued" />
                                                    <Text as="p" tone="subdued" variant="bodyMd">Setup your identity to see a preview.</Text>
                                                </BlockStack>
                                            </div>
                                        )}
                                    </BlockStack>
                                </Box>

                                <Box padding="400" borderBlockStartWidth="025" borderColor="border">
                                    <BlockStack gap="300">
                                        <TextField
                                            label="Experimental Placeholder URL"
                                            value={sampleUrl}
                                            onChange={setSampleUrl}
                                            autoComplete="off"
                                            suffix={<Button onClick={generatePreview}>Load</Button>}
                                        />
                                        <Banner tone="warning">
                                            <p>Previews are <b>virtual</b> and do not affect your live store until you launch a bulk process from the dashboard.</p>
                                        </Banner>
                                    </BlockStack>
                                </Box>
                            </Card>
                        </div>
                    </Layout.Section>
                </Layout>
            </div >
        </Page >
    );
}
