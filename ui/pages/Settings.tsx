import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
    Spinner,
    DropZone,
    Thumbnail
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
    const [uploading, setUploading] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [settings, setSettings] = useState<WatermarkSettings>({
        logo_url: null,
        logo_position: 'bottom-right',
        logo_opacity: 0.8,
        logo_margin: 20,
        logo_scale: 0.2,
        logo_rotation: 0,
        logo_x: 80, // Default to bottom-rightish
        logo_y: 80,
        text_content: '',
        text_font: 'Arial',
        text_size: 40,
        text_color: '#FFFFFF',
        text_position: 'bottom-right',
        text_opacity: 0.8,
        text_outline: true,
        text_outline_color: '#000000',
        text_rotation: 0,
        text_x: 10, // Default to top-leftish
        text_y: 90,
        use_custom_placement: false,
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

    const containerRef = useRef<HTMLDivElement>(null);
    const [draggingElement, setDraggingElement] = useState<'logo' | 'text' | null>(null);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!draggingElement || !containerRef.current || !settings.use_custom_placement) return;

        const rect = containerRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        const constrainedX = Math.round(Math.max(0, Math.min(100, x)));
        const constrainedY = Math.round(Math.max(0, Math.min(100, y)));

        if (draggingElement === 'logo') {
            setSettings(prev => ({ ...prev, logo_x: constrainedX, logo_y: constrainedY }));
        } else if (draggingElement === 'text') {
            setSettings(prev => ({ ...prev, text_x: constrainedX, text_y: constrainedY }));
        }
    }, [draggingElement, settings.use_custom_placement]);

    const handleMouseUp = useCallback(() => {
        setDraggingElement(null);
    }, []);

    useEffect(() => {
        if (draggingElement) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [draggingElement, handleMouseMove, handleMouseUp]);

    const updateSetting = (key: keyof WatermarkSettings, value: any) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleDrop = useCallback(async (_droppedFiles: File[], acceptedFiles: File[], _rejectedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            setUploading(true);
            const file = acceptedFiles[0];
            try {
                // 1. Get staged URL from our backend
                const { target } = await api.getStagedUploadUrl(file.name, file.type);

                // 2. Upload directly to Shopify's staged storage (usually S3)
                const formData = new FormData();
                target.parameters.forEach((p: any) => formData.append(p.name, p.value));
                formData.append('file', file);

                await fetch(target.url, {
                    method: 'POST',
                    body: formData
                });

                // 3. Register the file in Shopify and save record in our DB
                const { asset } = await api.registerAsset({
                    resourceUrl: target.resourceUrl,
                    filename: file.name,
                    mimeType: file.type,
                    fileSize: file.size
                });

                // 4. Update the logo_url setting
                updateSetting('logo_url', asset.file_url);

            } catch (error) {
                console.error('Upload failed:', error);
            } finally {
                setUploading(false);
            }
        }
    }, [api, updateSetting]);

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
                                        <BlockStack gap="300">
                                            <TextField
                                                label="Brand Logo URL"
                                                value={settings.logo_url || ''}
                                                onChange={(val) => updateSetting('logo_url', val)}
                                                autoComplete="off"
                                                placeholder="https://your-domain.com/logo.png"
                                                helpText="Supports PNG, SVG, and JPEG. Transparent PNG/SVG is recommended."
                                            />

                                            <div style={{ marginTop: '10px' }}>
                                                <DropZone
                                                    onDrop={handleDrop}
                                                    label="Or Upload Logo"
                                                    accept="image/*"
                                                    type="image"
                                                    disabled={uploading}
                                                >
                                                    {uploading ? (
                                                        <div style={{ padding: '20px', textAlign: 'center' }}>
                                                            <BlockStack gap="200" align="center">
                                                                <Spinner size="small" />
                                                                <Text as="p">Uploading logo...</Text>
                                                            </BlockStack>
                                                        </div>
                                                    ) : settings.logo_url ? (
                                                        <DropZone.FileUpload actionHint="Replace logo" />
                                                    ) : (
                                                        <DropZone.FileUpload actionTitle="Add logo" />
                                                    )}
                                                </DropZone>
                                            </div>
                                        </BlockStack>

                                        {settings.logo_url && (
                                            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                                                <BlockStack gap="400">
                                                    {settings.use_custom_placement ? (
                                                        <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                                                            <InlineStack gap="400" align="start">
                                                                <div style={{ flex: 1 }}>
                                                                    <RangeSlider
                                                                        label={`Horizontal Position (X): ${settings.logo_x}%`}
                                                                        value={settings.logo_x}
                                                                        min={0}
                                                                        max={100}
                                                                        onChange={(val) => updateSetting('logo_x', val)}
                                                                        output
                                                                    />
                                                                </div>
                                                                <div style={{ flex: 1 }}>
                                                                    <RangeSlider
                                                                        label={`Vertical Position (Y): ${settings.logo_y}%`}
                                                                        value={settings.logo_y}
                                                                        min={0}
                                                                        max={100}
                                                                        onChange={(val) => updateSetting('logo_y', val)}
                                                                        output
                                                                    />
                                                                </div>
                                                            </InlineStack>
                                                        </Box>
                                                    ) : (
                                                        <Select
                                                            label="Logo Placement"
                                                            options={POSITION_OPTIONS}
                                                            value={settings.logo_position}
                                                            onChange={(val) => updateSetting('logo_position', val)}
                                                        />
                                                    )}
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
                                                    <RangeSlider
                                                        label={`Rotation: ${settings.logo_rotation}°`}
                                                        value={settings.logo_rotation}
                                                        min={-180}
                                                        max={180}
                                                        step={1}
                                                        onChange={(val) => updateSetting('logo_rotation', val)}
                                                        output
                                                    />
                                                    {!settings.use_custom_placement && (
                                                        <TextField
                                                            label="Margin Offset (px)"
                                                            type="number"
                                                            value={settings.logo_margin.toString()}
                                                            onChange={(val) => updateSetting('logo_margin', parseInt(val) || 0)}
                                                            autoComplete="off"
                                                        />
                                                    )}
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
                                                    {settings.use_custom_placement ? (
                                                        <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                                                            <InlineStack gap="400" align="start">
                                                                <div style={{ flex: 1 }}>
                                                                    <RangeSlider
                                                                        label={`Text Horizontal (X): ${settings.text_x}%`}
                                                                        value={settings.text_x}
                                                                        min={0}
                                                                        max={100}
                                                                        onChange={(val) => updateSetting('text_x', val)}
                                                                        output
                                                                    />
                                                                </div>
                                                                <div style={{ flex: 1 }}>
                                                                    <RangeSlider
                                                                        label={`Text Vertical (Y): ${settings.text_y}%`}
                                                                        value={settings.text_y}
                                                                        min={0}
                                                                        max={100}
                                                                        onChange={(val) => updateSetting('text_y', val)}
                                                                        output
                                                                    />
                                                                </div>
                                                            </InlineStack>
                                                        </Box>
                                                    ) : (
                                                        <Select
                                                            label="Text Placement"
                                                            options={POSITION_OPTIONS}
                                                            value={settings.text_position}
                                                            onChange={(val) => updateSetting('text_position', val)}
                                                        />
                                                    )}
                                                    <RangeSlider
                                                        label={`Text Opacity: ${Math.round(settings.text_opacity * 100)}%`}
                                                        value={settings.text_opacity}
                                                        min={0.1}
                                                        max={1.0}
                                                        step={0.1}
                                                        onChange={(val) => updateSetting('text_opacity', val)}
                                                        output
                                                    />
                                                    <RangeSlider
                                                        label={`Text Rotation: ${settings.text_rotation}°`}
                                                        value={settings.text_rotation}
                                                        min={-180}
                                                        max={180}
                                                        step={1}
                                                        onChange={(val) => updateSetting('text_rotation', val)}
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
                                                                suffix={
                                                                    <div style={{ position: 'relative', width: '24px', height: '24px' }}>
                                                                        <input
                                                                            type="color"
                                                                            value={settings.text_color.length === 4 ? settings.text_color.replace(/#(.)(.)(.)/, '#$1$1$2$2$3$3') : settings.text_color}
                                                                            onChange={(e) => updateSetting('text_color', e.target.value)}
                                                                            style={{
                                                                                position: 'absolute',
                                                                                top: 0,
                                                                                left: 0,
                                                                                width: '100%',
                                                                                height: '100%',
                                                                                opacity: 0,
                                                                                cursor: 'pointer'
                                                                            }}
                                                                        />
                                                                        <div style={{
                                                                            width: '100%',
                                                                            height: '100%',
                                                                            background: settings.text_color,
                                                                            border: '1px solid var(--p-color-border-subdued)',
                                                                            borderRadius: '4px',
                                                                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)'
                                                                        }} />
                                                                    </div>
                                                                }
                                                            />
                                                        </Box>
                                                        <Box width="45%">
                                                            <TextField
                                                                label="Outline Color"
                                                                type="text"
                                                                value={settings.text_outline_color}
                                                                onChange={(val) => updateSetting('text_outline_color', val)}
                                                                autoComplete="off"
                                                                suffix={
                                                                    <div style={{ position: 'relative', width: '24px', height: '24px' }}>
                                                                        <input
                                                                            type="color"
                                                                            value={settings.text_outline_color.length === 4 ? settings.text_outline_color.replace(/#(.)(.)(.)/, '#$1$1$2$2$3$3') : settings.text_outline_color}
                                                                            onChange={(e) => updateSetting('text_outline_color', e.target.value)}
                                                                            style={{
                                                                                position: 'absolute',
                                                                                top: 0,
                                                                                left: 0,
                                                                                width: '100%',
                                                                                height: '100%',
                                                                                opacity: 0,
                                                                                cursor: 'pointer'
                                                                            }}
                                                                        />
                                                                        <div style={{
                                                                            width: '100%',
                                                                            height: '100%',
                                                                            background: settings.text_outline_color,
                                                                            border: '1px solid var(--p-color-border-subdued)',
                                                                            borderRadius: '4px',
                                                                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)'
                                                                        }} />
                                                                    </div>
                                                                }
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
                                    <BlockStack gap="200">
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
                                                Final Check
                                            </Button>
                                        </InlineStack>
                                        <Checkbox
                                            label="Enable Manual Drag & Drop Placement"
                                            checked={settings.use_custom_placement}
                                            onChange={(val) => updateSetting('use_custom_placement', val)}
                                            helpText="When enabled, you can drag elements directly on the preview to set their position."
                                        />
                                    </BlockStack>
                                </Box>

                                <Box padding="600" background="bg-surface-secondary">
                                    <BlockStack gap="400" align="center">
                                        {previewLoading && !previewImage ? (
                                            <div style={{ padding: '80px 0', width: '100%' }}>
                                                <BlockStack gap="400" align="center">
                                                    <Spinner size="large" />
                                                    <Text variant="bodyMd" as="p" tone="subdued">Synthesizing preview...</Text>
                                                </BlockStack>
                                            </div>
                                        ) : (
                                            <div
                                                ref={containerRef}
                                                style={{
                                                    position: 'relative',
                                                    width: '100%',
                                                    maxWidth: '800px',
                                                    margin: '0 auto',
                                                    userSelect: 'none'
                                                }}
                                            >
                                                {/* Base Image */}
                                                <img
                                                    src={sampleUrl}
                                                    style={{
                                                        display: 'block',
                                                        width: '100%',
                                                        height: 'auto',
                                                        borderRadius: '12px',
                                                        boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
                                                        border: '1px solid rgba(0,0,0,0.05)',
                                                        pointerEvents: 'none'
                                                    }}
                                                    alt="Composition Base"
                                                />

                                                {/* Logo Overlayer */}
                                                {settings.logo_url && (
                                                    <div
                                                        onMouseDown={() => settings.use_custom_placement && setDraggingElement('logo')}
                                                        style={{
                                                            position: 'absolute',
                                                            left: settings.use_custom_placement ? `${settings.logo_x}%` : 'auto',
                                                            top: settings.use_custom_placement ? `${settings.logo_y}%` : 'auto',
                                                            ...(!settings.use_custom_placement && {
                                                                top: settings.logo_position.includes('top') ? `${settings.logo_margin / 8}%` : (settings.logo_position.includes('middle') || settings.logo_position === 'center') ? '50%' : 'auto',
                                                                bottom: settings.logo_position.includes('bottom') ? `${settings.logo_margin / 8}%` : 'auto',
                                                                left: settings.logo_position.includes('left') ? `${settings.logo_margin / 8}%` : (settings.logo_position.includes('center') || settings.logo_position.includes('middle')) ? '50%' : 'auto',
                                                                right: settings.logo_position.includes('right') ? `${settings.logo_margin / 8}%` : 'auto',
                                                                transform: `translate(${settings.logo_position.includes('center') || settings.logo_position === 'center' ? '-50%' : '0'}, ${settings.logo_position.includes('middle') || settings.logo_position === 'center' ? '-50%' : '0'})`
                                                            }),
                                                            ...(settings.use_custom_placement && {
                                                                transform: 'translate(-50%, -50%)'
                                                            }),
                                                            cursor: settings.use_custom_placement ? (draggingElement === 'logo' ? 'grabbing' : 'grab') : 'default',
                                                            width: `${settings.logo_scale * 100}%`,
                                                            opacity: settings.logo_opacity,
                                                            transition: draggingElement === 'logo' ? 'none' : 'all 0.2s ease',
                                                            zIndex: 10,
                                                            padding: '4px',
                                                            border: draggingElement === 'logo' ? '2px dashed var(--p-color-border-brand)' : settings.use_custom_placement ? '1px dashed rgba(255,255,255,0.3)' : 'none',
                                                            borderRadius: '4px'
                                                        }}
                                                    >
                                                        <img
                                                            src={settings.logo_url}
                                                            style={{
                                                                width: '100%',
                                                                height: 'auto',
                                                                display: 'block',
                                                                transform: `rotate(${settings.logo_rotation}deg)`,
                                                                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))'
                                                            }}
                                                            alt="Logo"
                                                        />
                                                    </div>
                                                )}

                                                {/* Text Overlayer */}
                                                {settings.text_content && (
                                                    <div
                                                        onMouseDown={() => settings.use_custom_placement && setDraggingElement('text')}
                                                        style={{
                                                            position: 'absolute',
                                                            left: settings.use_custom_placement ? `${settings.text_x}%` : 'auto',
                                                            top: settings.use_custom_placement ? `${settings.text_y}%` : 'auto',
                                                            ...(!settings.use_custom_placement && {
                                                                top: settings.text_position.includes('top') ? '20px' : (settings.text_position.includes('middle') || settings.text_position === 'center') ? '50%' : 'auto',
                                                                bottom: settings.text_position.includes('bottom') ? '20px' : 'auto',
                                                                left: settings.text_position.includes('left') ? '20px' : (settings.text_position.includes('center') || settings.text_position.includes('middle')) ? '50%' : 'auto',
                                                                right: settings.text_position.includes('right') ? '20px' : 'auto',
                                                                transform: `translate(${settings.text_position.includes('center') || settings.text_position === 'center' ? '-50%' : '0'}, ${settings.text_position.includes('middle') || settings.text_position === 'center' ? '-50%' : '0'})`
                                                            }),
                                                            ...(settings.use_custom_placement && {
                                                                transform: 'translate(-50%, -50%)'
                                                            }),
                                                            cursor: settings.use_custom_placement ? (draggingElement === 'text' ? 'grabbing' : 'grab') : 'default',
                                                            color: settings.text_color,
                                                            fontSize: `${settings.text_size / 8}cqw`, // Adjusted scaling
                                                            fontFamily: settings.text_font,
                                                            opacity: settings.text_opacity,
                                                            fontWeight: 'bold',
                                                            whiteSpace: 'nowrap',
                                                            textShadow: settings.text_outline ? `0 0 4px ${settings.text_outline_color}, 1px 1px 2px rgba(0,0,0,0.8)` : '0 1px 2px rgba(0,0,0,0.5)',
                                                            transition: draggingElement === 'text' ? 'none' : 'all 0.2s ease',
                                                            zIndex: 11,
                                                            pointerEvents: 'auto',
                                                            padding: '4px 8px',
                                                            border: draggingElement === 'text' ? '2px dashed var(--p-color-border-brand)' : settings.use_custom_placement ? '1px dashed rgba(255,255,255,0.3)' : 'none',
                                                            borderRadius: '4px'
                                                        }}
                                                    >
                                                        <div style={{ transform: `rotate(${settings.text_rotation}deg)` }}>
                                                            {settings.text_content}
                                                        </div>
                                                    </div>
                                                )}

                                                <div style={{ position: 'absolute', top: '12px', left: '12px', pointerEvents: 'none' }}>
                                                    <Badge tone="info" icon={SettingsIcon}>
                                                        {settings.use_custom_placement ? 'Interactive Mode' : 'Position Presets'}
                                                    </Badge>
                                                </div>
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
