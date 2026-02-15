package com.runlify.metadata;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;

/**
 * Loads and parses metadata.json into {@link ProjectMetadata}.
 */
@Service
public class MetadataLoader {

    private static final Logger log = LoggerFactory.getLogger(MetadataLoader.class);

    private final ProjectMetadata metadata;

    public MetadataLoader(@Value("${runlify.metadata.path}") String metadataPath) {
        this.metadata = load(metadataPath);
    }

    public ProjectMetadata getMetadata() {
        return metadata;
    }

    private static ProjectMetadata load(String path) {
        var mapper = JsonMapper.builder()
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();

        var file = new File(path);
        if (!file.exists()) {
            throw new IllegalStateException("Metadata file not found: " + file.getAbsolutePath());
        }

        var meta = mapper.readValue(file, ProjectMetadata.class);
        log.info("Loaded metadata '{}': {} catalogs, {} documents, {} infoRegistries, {} sumRegistries",
            meta.name(),
            meta.catalogs().size(),
            meta.documents().size(),
            meta.infoRegistries().size(),
            meta.sumRegistries().size());
        return meta;
    }
}
